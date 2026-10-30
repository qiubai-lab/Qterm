#[derive(Clone, serde::Deserialize, serde::Serialize)]
#[serde(deny_unknown_fields)]
pub struct WebBounds {
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
    pub visible: bool,
    #[serde(default, rename = "inputBlocked")]
    pub input_blocked: bool,
    #[serde(default)]
    pub covered: bool,
    #[serde(default)]
    pub occlusions: Vec<WebClipRect>,
    #[serde(default)]
    pub frame: Option<super::frame_raster::WebFrame>,
    #[serde(default)]
    pub panels: Vec<super::surface_raster::WebPanel>,
    #[serde(default)]
    pub scrollbar: Option<[[u8; 4]; 3]>,
}

#[derive(Clone, serde::Deserialize, serde::Serialize)]
#[serde(deny_unknown_fields)]
pub struct WebClipRect {
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
}

impl WebBounds {
    pub fn valid(&self) -> bool {
        [self.x, self.y, self.width, self.height]
            .iter()
            .all(|n| n.is_finite() && *n >= 0.0 && *n <= 32768.0)
            && self.width >= 1.0
            && self.height >= 1.0
            && (!self.covered || self.input_blocked)
            && self
                .frame
                .as_ref()
                .is_none_or(super::frame_raster::WebFrame::valid)
            && self.panels.len() <= 8
            && self.panels.iter().all(|panel| panel.edge.valid())
            && self.occlusions.len() <= 64
            && self.occlusions.iter().all(|rect| {
                [rect.x, rect.y, rect.width, rect.height]
                    .iter()
                    .all(|n| n.is_finite() && *n >= 0.0)
                    && rect.width > 0.0
                    && rect.height > 0.0
                    && rect.x + rect.width <= self.width + 1e-6
                    && rect.y + rect.height <= self.height + 1e-6
            })
    }
}
