use super::{
    auth::AuthRequest,
    session::{HostEndpoint, RouteNodeMetadata, RouteNodeRole},
};
pub struct SessionRouteNode {
    pub profile_id: String,
    pub name: String,
    pub endpoint: HostEndpoint,
    pub username: String,
    pub auth: AuthRequest,
}

impl SessionRouteNode {
    pub fn metadata(&self, index: usize, total: usize) -> RouteNodeMetadata {
        RouteNodeMetadata {
            profile_id: self.profile_id.clone(),
            name: self.name.clone(),
            endpoint: self.endpoint.clone(),
            index,
            total,
            role: if index + 1 == total {
                RouteNodeRole::Target
            } else {
                RouteNodeRole::Jump
            },
        }
    }
}
