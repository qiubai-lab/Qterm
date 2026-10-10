use super::*;
#[test]
fn persistence_cas_and_invalid_batch_are_atomic() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("db");
    let mut db = Database::open(&path).unwrap();
    let initial = db.snapshot().unwrap();
    let mut catalog = Catalog::default();
    catalog
        .groups
        .insert("g".into(), Group { name: "G".into() });
    let request = Push {
        protocol: PROTOCOL,
        server_id: initial.server_id.clone(),
        base_revision: 0,
        catalog,
    };
    let saved = db.push(request.clone()).unwrap();
    assert_eq!(saved.revision, 1);
    assert_eq!(db.push(request).unwrap_err(), "conflict");
    let mut invalid = saved.catalog.clone();
    invalid
        .groups
        .insert("h".into(), Group { name: "G".into() });
    assert_eq!(
        db.push(Push {
            protocol: PROTOCOL,
            server_id: saved.server_id.clone(),
            base_revision: 1,
            catalog: invalid
        })
        .unwrap_err(),
        "invalid"
    );
    assert_eq!(db.snapshot().unwrap(), saved);
    drop(db);
    assert_eq!(Database::open(&path).unwrap().snapshot().unwrap(), saved);
}

#[test]
fn normalized_rows_roundtrip_ordered_jumps_and_transactional_deletion() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("db");
    let mut db = Database::open(&path).unwrap();
    let first = db.snapshot().unwrap();
    let p = Profile {
        name: "A".into(),
        host: "host".into(),
        port: 22,
        username: "root".into(),
        auth_preference: AuthPreference::Password,
        group_id: Some("g".into()),
        jump_profile_ids: vec![],
    };
    let mut catalog = Catalog::default();
    catalog
        .groups
        .insert("g".into(), Group { name: "G".into() });
    catalog.profiles.insert("a".into(), p.clone());
    catalog.profiles.insert("b".into(), p.clone());
    catalog.profiles.insert(
        "c".into(),
        Profile {
            jump_profile_ids: vec!["b".into(), "a".into()],
            ..p
        },
    );
    let saved = db
        .push(Push {
            protocol: PROTOCOL,
            server_id: first.server_id,
            base_revision: 0,
            catalog: catalog.clone(),
        })
        .unwrap();
    assert_eq!(db.snapshot().unwrap().catalog, catalog);
    let connection = Connection::open(path).unwrap();
    assert_eq!(
        connection
            .query_row("SELECT count(*) FROM profiles", [], |r| r.get::<_, u32>(0))
            .unwrap(),
        3
    );
    assert_eq!(
        connection
            .query_row(
                "SELECT jump_id FROM profile_jumps WHERE profile_id='c' AND position=0",
                [],
                |r| r.get::<_, String>(0)
            )
            .unwrap(),
        "b"
    );
    catalog.profiles.remove("a");
    assert!(
        db.push(Push {
            protocol: PROTOCOL,
            server_id: saved.server_id.clone(),
            base_revision: saved.revision,
            catalog
        })
        .is_err()
    );
    assert_eq!(db.snapshot().unwrap(), saved);
    db.push(Push {
        protocol: PROTOCOL,
        server_id: saved.server_id,
        base_revision: saved.revision,
        catalog: Catalog::default(),
    })
    .unwrap();
    assert!(db.snapshot().unwrap().catalog.profiles.is_empty());
}
