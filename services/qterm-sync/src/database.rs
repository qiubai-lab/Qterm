use qterm_sync_core::{AuthPreference, Catalog, Group, PROTOCOL, Profile, Push, Snapshot};
use rusqlite::{Connection, params};
use std::{path::Path, time::Duration};

pub struct Database(Connection);

impl Database {
    pub fn open(path: &Path) -> Result<Self, String> {
        let connection = Connection::open(path).map_err(|_| "无法打开数据库")?;
        connection
            .busy_timeout(Duration::from_secs(5))
            .map_err(|_| "数据库超时设置失败")?;
        let version: u32 = connection
            .query_row("PRAGMA user_version", [], |r| r.get(0))
            .map_err(|_| "无法读取数据库版本")?;
        if version > 1 {
            return Err("数据库版本高于服务支持的版本".into());
        }
        connection
            .execute_batch(
                "PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA foreign_keys=ON;",
            )
            .map_err(|_| "数据库初始化失败")?;
        connection
            .execute_batch(include_str!("schema.sql"))
            .map_err(|_| "数据库迁移失败")?;
        connection
            .execute(
                "INSERT OR IGNORE INTO metadata VALUES (1, ?1, 0)",
                [uuid::Uuid::new_v4().to_string()],
            )
            .map_err(|_| "数据库标识初始化失败")?;
        Ok(Self(connection))
    }

    pub fn snapshot(&mut self) -> Result<Snapshot, String> {
        let transaction = self.0.transaction().map_err(|_| "数据库事务失败")?;
        let result = read(&transaction).map_err(|_| "读取数据库失败")?;
        transaction.commit().map_err(|_| "数据库事务失败")?;
        Ok(result)
    }

    pub fn push(&mut self, input: Push) -> Result<Snapshot, &'static str> {
        if input.protocol != PROTOCOL {
            return Err("protocol");
        }
        input.catalog.validate().map_err(|_| "invalid")?;
        let tx = self
            .0
            .transaction_with_behavior(rusqlite::TransactionBehavior::Immediate)
            .map_err(|_| "storage")?;
        let current = read(&tx).map_err(|_| "storage")?;
        if current.server_id != input.server_id || current.revision != input.base_revision {
            return Err("conflict");
        }
        if current.catalog == input.catalog {
            return Ok(current);
        }
        // One atomic replacement of normalized rows under the catalog CAS. No JSON blobs.
        tx.execute_batch(
            "DELETE FROM profile_jumps; DELETE FROM profiles; DELETE FROM profile_groups;",
        )
        .map_err(|_| "storage")?;
        for (id, group) in &input.catalog.groups {
            tx.execute(
                "INSERT INTO profile_groups VALUES (?1, ?2)",
                params![id, group.name],
            )
            .map_err(|_| "storage")?;
        }
        for (id, p) in &input.catalog.profiles {
            let auth = match p.auth_preference {
                AuthPreference::Manual => "manual",
                AuthPreference::Password => "password",
                AuthPreference::PrivateKey => "privateKey",
                AuthPreference::SshAgent => "sshAgent",
            };
            tx.execute(
                "INSERT INTO profiles VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
                params![id, p.name, p.host, p.port, p.username, auth, p.group_id],
            )
            .map_err(|_| "storage")?;
        }
        for (id, p) in &input.catalog.profiles {
            for (position, jump) in p.jump_profile_ids.iter().enumerate() {
                tx.execute(
                    "INSERT INTO profile_jumps VALUES (?1, ?2, ?3)",
                    params![id, jump, position as u32],
                )
                .map_err(|_| "storage")?;
            }
        }
        let revision = current
            .revision
            .checked_add(1)
            .filter(|v| *v <= i64::MAX as u64)
            .ok_or("storage")?;
        tx.execute(
            "UPDATE metadata SET revision=?1 WHERE singleton=1",
            [revision as i64],
        )
        .map_err(|_| "storage")?;
        tx.commit().map_err(|_| "storage")?;
        Ok(Snapshot {
            protocol: PROTOCOL,
            server_id: current.server_id,
            revision,
            catalog: input.catalog,
        })
    }
}

fn read(connection: &Connection) -> rusqlite::Result<Snapshot> {
    let (server_id, revision) = connection.query_row(
        "SELECT server_id, revision FROM metadata WHERE singleton=1",
        [],
        |r| Ok((r.get(0)?, r.get::<_, i64>(1)?)),
    )?;
    let revision = u64::try_from(revision).map_err(|_| rusqlite::Error::InvalidQuery)?;
    let mut catalog = Catalog::default();
    let mut groups = connection.prepare("SELECT id, name FROM profile_groups")?;
    for row in groups.query_map([], |r| {
        Ok((r.get::<_, String>(0)?, Group { name: r.get(1)? }))
    })? {
        let (id, group) = row?;
        catalog.groups.insert(id, group);
    }
    let mut profiles = connection.prepare(
        "SELECT id, name, host, port, username, auth_preference, group_id FROM profiles",
    )?;
    for row in profiles.query_map([], |r| {
        let auth: String = r.get(5)?;
        let auth_preference = match auth.as_str() {
            "manual" => AuthPreference::Manual,
            "password" => AuthPreference::Password,
            "privateKey" => AuthPreference::PrivateKey,
            "sshAgent" => AuthPreference::SshAgent,
            _ => return Err(rusqlite::Error::InvalidQuery),
        };
        Ok((
            r.get::<_, String>(0)?,
            Profile {
                name: r.get(1)?,
                host: r.get(2)?,
                port: r.get(3)?,
                username: r.get(4)?,
                auth_preference,
                group_id: r.get(6)?,
                jump_profile_ids: vec![],
            },
        ))
    })? {
        let (id, profile) = row?;
        catalog.profiles.insert(id, profile);
    }
    let mut jumps =
        connection.prepare("SELECT profile_id, jump_id FROM profile_jumps ORDER BY position")?;
    for row in jumps.query_map([], |r| Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?)))? {
        let (id, jump) = row?;
        catalog
            .profiles
            .get_mut(&id)
            .ok_or(rusqlite::Error::InvalidQuery)?
            .jump_profile_ids
            .push(jump);
    }
    Ok(Snapshot {
        protocol: PROTOCOL,
        server_id,
        revision,
        catalog,
    })
}

#[cfg(test)]
mod tests;
