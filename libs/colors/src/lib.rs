//! Color optimization runs entirely in Wasm; JS supplies one seed per request.
//! Objective and annealing settings follow category-colors 3.0.1 (see NOTICE).

use palette::{Okhsl, Srgb, convert::FromColorUnclamped};
use std::f64::consts::{PI, TAU};
use wasm_bindgen::prelude::*;

type Triple = [f64; 3];

// Full-severity Machado matrices, applied to encoded sRGB to match Culori 4.0.2.
const CVD: [[Triple; 3]; 3] = [
    [
        [0.152286, 1.052583, -0.204868],
        [0.114503, 0.786281, 0.099216],
        [-0.003882, -0.048116, 1.051998],
    ],
    [
        [0.367322, 0.860646, -0.227968],
        [0.280085, 0.672501, 0.047413],
        [-0.01182, 0.04294, 0.968881],
    ],
    [
        [1.255528, -0.076749, -0.178779],
        [-0.078411, 0.930809, 0.147602],
        [0.004733, 0.691367, 0.3039],
    ],
];

fn dot(a: Triple, b: Triple) -> f64 {
    a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
}

fn linear(c: f64) -> f64 {
    if c.abs() <= 0.04045 {
        c / 12.92
    } else {
        c.signum() * ((c.abs() + 0.055) / 1.055).powf(2.4)
    }
}

fn lab(rgb: Triple) -> Triple {
    let lin = rgb.map(linear);
    let xyz = [
        dot(
            [0.4123907992659593, 0.357584339383878, 0.1804807884018343],
            lin,
        ) / (0.3127 / 0.329),
        dot(
            [0.2126390058715102, 0.715168678767756, 0.0721923153607337],
            lin,
        ),
        dot(
            [0.0193308187155918, 0.119194779794626, 0.9505321522496607],
            lin,
        ) / ((1.0 - 0.3127 - 0.329) / 0.329),
    ]
    .map(|v| {
        if v > 216.0 / 24389.0 {
            v.cbrt()
        } else {
            ((24389.0 / 27.0) * v + 16.0) / 116.0
        }
    });
    if rgb[0] == rgb[1] && rgb[1] == rgb[2] {
        [116.0 * xyz[1] - 16.0, 0.0, 0.0]
    } else {
        [
            116.0 * xyz[1] - 16.0,
            500.0 * (xyz[0] - xyz[1]),
            200.0 * (xyz[1] - xyz[2]),
        ]
    }
}

// CIEDE2000, D65 Lab, unit parametric factors (same as Culori).
fn delta_e(a: Triple, b: Triple) -> f64 {
    let c1 = a[1].hypot(a[2]);
    let c2 = b[1].hypot(b[2]);
    let avg7 = ((c1 + c2) / 2.0).powi(7);
    let g = 0.5 * (1.0 - (avg7 / (avg7 + 25_f64.powi(7))).sqrt());
    let ap1 = a[1] * (1.0 + g);
    let ap2 = b[1] * (1.0 + g);
    let cp1 = ap1.hypot(a[2]);
    let cp2 = ap2.hypot(b[2]);
    let hp1 = a[2].atan2(ap1).rem_euclid(TAU);
    let hp2 = b[2].atan2(ap2).rem_euclid(TAU);
    let product = cp1 * cp2;
    let mut dh = if product == 0.0 { 0.0 } else { hp2 - hp1 };
    if dh > PI {
        dh -= TAU;
    }
    if dh < -PI {
        dh += TAU;
    }
    let dl = b[0] - a[0];
    let dc = cp2 - cp1;
    let dh = 2.0 * product.sqrt() * (dh / 2.0).sin();
    let lp = (a[0] + b[0]) / 2.0;
    let cp = (cp1 + cp2) / 2.0;
    let hp = if product == 0.0 {
        hp1 + hp2
    } else {
        ((hp1 + hp2) / 2.0 - if (hp1 - hp2).abs() > PI { PI } else { 0.0 }).rem_euclid(TAU)
    };
    let t = 1.0 - 0.17 * (hp - PI / 6.0).cos()
        + 0.24 * (2.0 * hp).cos()
        + 0.32 * (3.0 * hp + PI / 30.0).cos()
        - 0.2 * (4.0 * hp - 63_f64.to_radians()).cos();
    let l50 = (lp - 50.0).powi(2);
    let sl = 1.0 + 0.015 * l50 / (20.0 + l50).sqrt();
    let sc = 1.0 + 0.045 * cp;
    let sh = 1.0 + 0.015 * cp * t;
    let theta = 30_f64.to_radians() * (-((hp.to_degrees() - 275.0) / 25.0).powi(2)).exp();
    let cp7 = cp.powi(7);
    let rt = -2.0 * (cp7 / (cp7 + 25_f64.powi(7))).sqrt() * (2.0 * theta).sin();
    ((dl / sl).powi(2) + (dc / sc).powi(2) + (dh / sh).powi(2) + rt * dc / sc * dh / sh)
        .max(0.0)
        .sqrt()
}

fn parse_hex(value: &str) -> Result<Triple, JsError> {
    let hex = value
        .strip_prefix('#')
        .filter(|s| s.len() == 6 && s.is_ascii())
        .ok_or_else(|| JsError::new("Invalid HEX color."))?;
    let n = u32::from_str_radix(hex, 16).map_err(|_| JsError::new("Invalid HEX color."))?;
    Ok([
        (n >> 16) as f64 / 255.0,
        ((n >> 8) & 255) as f64 / 255.0,
        (n & 255) as f64 / 255.0,
    ])
}

#[derive(Clone, Copy)]
struct Color {
    hsl: Triple,
    rgb: Triple,
    labs: [Triple; 4],
    luminance: f64,
}

impl Color {
    fn from_rgb(rgb: Triple, hsl: Triple) -> Self {
        let mut labs = [[0.0; 3]; 4];
        labs[0] = lab(rgb);
        for (index, matrix) in CVD.iter().enumerate() {
            labs[index + 1] = lab(matrix.map(|row| dot(row, rgb)));
        }
        Self {
            hsl,
            rgb,
            labs,
            luminance: dot([0.2126, 0.7152, 0.0722], rgb.map(linear)),
        }
    }

    fn from_hsl(hsl: Triple) -> Self {
        let rgb = Srgb::<f64>::from_color_unclamped(Okhsl::new(hsl[0], hsl[1], hsl[2]));
        Self::from_rgb([rgb.red, rgb.green, rgb.blue], hsl)
    }

    fn hex(self) -> String {
        let [r, g, b] = self.rgb.map(|v| (v.clamp(0.0, 1.0) * 255.0).round() as u8);
        format!("#{r:02x}{g:02x}{b:02x}")
    }
}

struct Random(u32);

impl Random {
    fn next(&mut self) -> f64 {
        self.0 ^= self.0 << 13;
        self.0 ^= self.0 >> 17;
        self.0 ^= self.0 << 5;
        (self.0 as f64 + 0.5) / 4294967296.0
    }

    fn vector(&mut self, distance: f64) -> Triple {
        let v = std::array::from_fn::<_, 3, _>(|_| {
            (-2.0 * self.next().ln()).sqrt() * (TAU * self.next()).cos()
        });
        let length = dot(v, v).sqrt();
        v.map(|x| x / length * distance)
    }
}

struct Objective {
    background: f64,
    contrast_weight: f64,
    max_distance: f64,
}

impl Objective {
    fn new(background: Triple, contrast_weight: f64) -> Self {
        let references = [
            "#000000", "#ffffff", "#ff0000", "#00ff00", "#0000ff", "#ffff00", "#00ffff", "#ff00ff",
        ]
        .map(|s| lab(parse_hex(s).unwrap()));
        let mut max_distance: f64 = 1.0;
        for (i, a) in references.iter().enumerate() {
            for b in &references[i + 1..] {
                max_distance = max_distance.max(delta_e(*a, *b));
            }
        }
        Self {
            background: dot([0.2126, 0.7152, 0.0722], background.map(linear)),
            contrast_weight,
            max_distance,
        }
    }

    fn cost(&self, colors: &[Color]) -> f64 {
        let n = colors.len();
        let mut contrast = 0.0;
        for color in colors {
            let ratio = (color.luminance.max(self.background) + 0.05)
                / (color.luminance.min(self.background) + 0.05);
            contrast += if ratio < 3.0 {
                (3.0 / ratio).powi(4)
            } else {
                (3.0 / ratio).sqrt()
            };
        }
        contrast /= n as f64;
        if n == 1 {
            return contrast * self.contrast_weight / (4.3 + self.contrast_weight);
        }
        let pairs = (n * (n - 1) / 2) as f64;
        let mut energy = 0.0;
        let mut jnd = [0.0; 4];
        let mut adjacent = 0.0;
        let mut distances = Vec::with_capacity(pairs as usize);
        for (i, a) in colors.iter().enumerate() {
            for (j, b) in colors.iter().enumerate().skip(i + 1) {
                for (view, total) in jnd.iter_mut().enumerate() {
                    let distance = delta_e(a.labs[view], b.labs[view]);
                    *total += if distance > 0.0 {
                        (20.0 / distance).powi(4)
                    } else {
                        1000.0
                    };
                    if view == 0 {
                        distances.push(distance);
                        energy += (1.0 - (distance / self.max_distance).clamp(0.0, 1.0)).powi(3);
                        if j == i + 1 {
                            adjacent += (30.0 / distance.max(1.0)).powi(4);
                        }
                    }
                }
            }
        }
        let mean = distances.iter().sum::<f64>() / pairs;
        let variance = distances.iter().map(|d| (d - mean).powi(2)).sum::<f64>() / pairs;
        let min = distances.iter().copied().fold(f64::INFINITY, f64::min);
        let max = distances.iter().copied().fold(f64::NEG_INFINITY, f64::max);
        let range_cost = if max == min {
            0.0
        } else {
            variance.sqrt() / (max - min)
        };
        (0.15 * energy / pairs
            + 0.15 * range_cost
            + 4.0 * jnd[0] / pairs
            + 0.01 * (jnd[1] + jnd[2] + jnd[3]) / pairs
            + 4.0 * adjacent / (n - 1) as f64
            + self.contrast_weight * contrast)
            / (8.33 + self.contrast_weight)
    }
}

fn mutate(color: Color, temperature: f64, lightness: [f64; 2], random: &mut Random) -> Color {
    let v = random.vector(0.005 + 0.145 * temperature);
    Color::from_hsl([
        (color.hsl[0] + v[0] * 360.0).rem_euclid(360.0),
        (color.hsl[1] + v[1] * 0.3).clamp(0.7, 1.0),
        (color.hsl[2] + v[2] * (lightness[1] - lightness[0])).clamp(lightness[0], lightness[1]),
    ])
}

#[wasm_bindgen]
#[allow(
    clippy::too_many_arguments,
    reason = "Flat Wasm arguments avoid settings serialization."
)]
pub fn generate_colors(
    count: u32,
    background: &str,
    lightness_min: f64,
    lightness_max: f64,
    contrast_weight: f64,
    existing: Vec<String>,
    target: i32,
    seed: u32,
) -> Result<Vec<String>, JsError> {
    if !(1..=20).contains(&count) {
        return Err(JsError::new("Color count must be between 1 and 20."));
    }
    if !lightness_min.is_finite()
        || !lightness_max.is_finite()
        || lightness_min < 0.0
        || lightness_min >= lightness_max
        || lightness_max > 1.0
        || !contrast_weight.is_finite()
        || !(0.0..=100.0).contains(&contrast_weight)
    {
        return Err(JsError::new("Setting is outside the allowed range."));
    }
    if target != -1 && (target < 0 || target >= count as i32 || existing.len() != count as usize) {
        return Err(JsError::new("Invalid color replacement target."));
    }
    let objective = Objective::new(parse_hex(background)?, contrast_weight);
    let mut random = Random(if seed == 0 { 1 } else { seed });
    let lightness = [lightness_min, lightness_max];
    let mut colors = (0..count as usize)
        .map(|index| {
            Ok(if target >= 0 && index != target as usize {
                Color::from_rgb(parse_hex(&existing[index])?, [0.0; 3])
            } else {
                Color::from_hsl([
                    random.next() * 360.0,
                    0.7 + random.next() * 0.3,
                    lightness_min + random.next() * (lightness_max - lightness_min),
                ])
            })
        })
        .collect::<Result<Vec<_>, JsError>>()?;
    let mut current_cost = objective.cost(&colors);
    let mut positive = 0.0;
    let mut samples = 0;
    // Match the library's 100-neighbor initial-temperature estimate.
    for _ in 0..100 {
        let index = if target >= 0 {
            target as usize
        } else {
            (random.next() * count as f64) as usize
        };
        let old = colors[index];
        colors[index] = mutate(old, 1.0, lightness, &mut random);
        let delta = objective.cost(&colors) - current_cost;
        colors[index] = old;
        if delta > 0.0 {
            positive += delta;
            samples += 1;
        }
    }
    let mut temperature = if samples == 0 {
        1000.0
    } else {
        -(positive / samples as f64) / 0.95_f64.ln()
    };
    for _ in 0..1000 {
        if temperature <= 0.0001 {
            break;
        }
        let index = if target >= 0 {
            target as usize
        } else {
            (random.next() * count as f64) as usize
        };
        let old = colors[index];
        colors[index] = mutate(old, temperature, lightness, &mut random);
        let candidate = objective.cost(&colors);
        if candidate <= current_cost
            || random.next() < (-(candidate - current_cost) / temperature).exp()
        {
            current_cost = candidate;
        } else {
            colors[index] = old;
        }
        temperature *= 0.99;
    }
    Ok(colors
        .into_iter()
        .enumerate()
        .map(|(index, color)| {
            if target >= 0 && index != target as usize {
                existing[index].clone()
            } else {
                color.hex()
            }
        })
        .collect())
}
