use std::{
    collections::HashSet,
    fs,
    io::{self, Write},
    path::PathBuf,
    sync::Mutex,
};

use atomic_write_file::AtomicWriteFile;
use russh::keys::{HashAlg, PublicKey};
use serde::{Deserialize, Serialize};

use crate::{
    domain::session::{HostEndpoint, PresentedHostKey},
    ports::known_host_repository::{KnownHostRepository, KnownHostRepositoryError},
};

const SCHEMA_VERSION: u64 = 1;
const MAX_DOCUMENT_BYTES: u64 = 1024 * 1024;

pub struct JsonKnownHostRepository {
    path: PathBuf,
    lock: Mutex<()>,
}

impl JsonKnownHostRepository {
    pub fn new(path: PathBuf) -> Self {
        Self {
            path,
            lock: Mutex::new(()),
        }
    }

    fn load(&self) -> Result<KnownHostsDocument, KnownHostRepositoryError> {
        match fs::metadata(&self.path) {
            Ok(metadata) if metadata.len() > MAX_DOCUMENT_BYTES => {
                return Err(KnownHostRepositoryError::CorruptData);
            }
            Ok(_) => {}
            Err(error) if error.kind() == io::ErrorKind::NotFound => {
                return Ok(KnownHostsDocument::default());
            }
            Err(_) => return Err(KnownHostRepositoryError::Io),
        }
        let bytes = fs::read(&self.path).map_err(|_| KnownHostRepositoryError::Io)?;
        let document: KnownHostsDocument =
            serde_json::from_slice(&bytes).map_err(|_| KnownHostRepositoryError::CorruptData)?;
        if document.schema_version != SCHEMA_VERSION {
            return Err(KnownHostRepositoryError::UnsupportedSchemaVersion);
        }
        let mut endpoints = HashSet::with_capacity(document.hosts.len());
        for record in &document.hosts {
            record.validate()?;
            if !endpoints.insert((record.host.clone(), record.port)) {
                return Err(KnownHostRepositoryError::CorruptData);
            }
        }
        Ok(document)
    }

    fn save(&self, document: &KnownHostsDocument) -> Result<(), KnownHostRepositoryError> {
        if let Some(parent) = self.path.parent() {
            fs::create_dir_all(parent).map_err(|_| KnownHostRepositoryError::Io)?;
        }
        let mut bytes =
            serde_json::to_vec_pretty(document).map_err(|_| KnownHostRepositoryError::Io)?;
        bytes.push(b'\n');
        let mut file =
            AtomicWriteFile::open(&self.path).map_err(|_| KnownHostRepositoryError::Io)?;
        file.write_all(&bytes)
            .map_err(|_| KnownHostRepositoryError::Io)?;
        file.commit().map_err(|_| KnownHostRepositoryError::Io)
    }
}

impl KnownHostRepository for JsonKnownHostRepository {
    fn find(
        &self,
        endpoint: &HostEndpoint,
    ) -> Result<Option<PresentedHostKey>, KnownHostRepositoryError> {
        let _guard = self.lock.lock().map_err(|_| KnownHostRepositoryError::Io)?;
        Ok(self
            .load()?
            .hosts
            .into_iter()
            .find(|record| record.host == endpoint.host() && record.port == endpoint.port())
            .map(HostRecord::into_domain))
    }

    fn trust(
        &self,
        endpoint: &HostEndpoint,
        key: &PresentedHostKey,
    ) -> Result<(), KnownHostRepositoryError> {
        let _guard = self.lock.lock().map_err(|_| KnownHostRepositoryError::Io)?;
        let mut document = self.load()?;
        let record = HostRecord::from_domain(endpoint, key);
        if let Some(stored) = document
            .hosts
            .iter_mut()
            .find(|stored| stored.host == record.host && stored.port == record.port)
        {
            *stored = record;
        } else {
            document.hosts.push(record);
        }
        self.save(&document)
    }
}

#[derive(Deserialize, Serialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
struct KnownHostsDocument {
    schema_version: u64,
    hosts: Vec<HostRecord>,
}

impl Default for KnownHostsDocument {
    fn default() -> Self {
        Self {
            schema_version: SCHEMA_VERSION,
            hosts: Vec::new(),
        }
    }
}

#[derive(Deserialize, Serialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
struct HostRecord {
    host: String,
    port: u16,
    algorithm: String,
    encoded: String,
    fingerprint: String,
}

impl HostRecord {
    fn from_domain(endpoint: &HostEndpoint, key: &PresentedHostKey) -> Self {
        Self {
            host: endpoint.host().to_owned(),
            port: endpoint.port(),
            algorithm: key.algorithm().to_owned(),
            encoded: key.encoded().to_owned(),
            fingerprint: key.fingerprint().to_owned(),
        }
    }

    fn into_domain(self) -> PresentedHostKey {
        PresentedHostKey::new(self.algorithm, self.encoded, self.fingerprint)
    }

    fn validate(&self) -> Result<(), KnownHostRepositoryError> {
        let endpoint = HostEndpoint::new(&self.host, self.port.into())
            .map_err(|_| KnownHostRepositoryError::CorruptData)?;
        if endpoint.host() != self.host {
            return Err(KnownHostRepositoryError::CorruptData);
        }
        let key = PublicKey::from_openssh(&self.encoded)
            .map_err(|_| KnownHostRepositoryError::CorruptData)?;
        if key.algorithm().to_string() != self.algorithm
            || key.fingerprint(HashAlg::Sha256).to_string() != self.fingerprint
        {
            return Err(KnownHostRepositoryError::CorruptData);
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use tempfile::tempdir;

    use russh::keys::ssh_key::{
        HashAlg, PrivateKey,
        private::{Ed25519Keypair, KeypairData},
    };

    use super::JsonKnownHostRepository;
    use crate::{
        domain::session::{HostEndpoint, PresentedHostKey},
        ports::known_host_repository::KnownHostRepository,
    };

    fn host_key() -> PresentedHostKey {
        let keypair = Ed25519Keypair::from_seed(&[9; 32]);
        let private =
            PrivateKey::new(KeypairData::from(keypair), "").expect("deterministic private key");
        let public = private.public_key();
        PresentedHostKey::new(
            public.algorithm().to_string(),
            public.to_openssh().expect("encode public key"),
            public.fingerprint(HashAlg::Sha256).to_string(),
        )
    }

    #[test]
    fn persists_trust_without_touching_system_known_hosts() {
        let directory = tempdir().expect("temp directory");
        let path = directory.path().join("known-hosts.json");
        let endpoint = HostEndpoint::new("example.com", 22).expect("endpoint");
        let key = host_key();
        let repository = JsonKnownHostRepository::new(path.clone());
        repository.trust(&endpoint, &key).expect("trust key");

        let reopened = JsonKnownHostRepository::new(path);
        assert_eq!(reopened.find(&endpoint).expect("find key"), Some(key));
    }

    #[test]
    fn unknown_schema_is_preserved_and_rejected() {
        let directory = tempdir().expect("temp directory");
        let path = directory.path().join("known-hosts.json");
        std::fs::write(&path, br#"{"schemaVersion":99,"hosts":[]}"#).expect("write fixture");
        let repository = JsonKnownHostRepository::new(path.clone());
        let endpoint = HostEndpoint::new("example.com", 22).expect("endpoint");
        assert!(repository.find(&endpoint).is_err());
        assert!(
            String::from_utf8(std::fs::read(path).expect("read source"))
                .expect("utf8")
                .contains("99")
        );
    }

    #[test]
    fn rejects_tampered_fingerprint_instead_of_displaying_it_as_trusted() {
        let directory = tempdir().expect("temp directory");
        let path = directory.path().join("known-hosts.json");
        let endpoint = HostEndpoint::new("example.com", 22).expect("endpoint");
        let repository = JsonKnownHostRepository::new(path.clone());
        repository
            .trust(&endpoint, &host_key())
            .expect("write valid trust record");
        let source = std::fs::read_to_string(&path).expect("read fixture");
        std::fs::write(&path, source.replace("SHA256:", "SHA256:tampered-"))
            .expect("tamper fixture");

        assert!(repository.find(&endpoint).is_err());
    }
}
