export interface StudioOptionItem {
  id: string;
  label: string;
  description: string;
  badge?: string;
  metaphorFamily?: string;
}

// 12 Authentic EcoTrophy Metaphor Territories
export const ECOTROPHY_METAPHOR_TERRITORIES: StudioOptionItem[] = [
  {
    id: 'Convergence',
    label: 'Convergence (Uniting Strengths)',
    description: 'Converging river tributaries, joined line systems, collective intelligence uniting for a breakthrough.',
    badge: 'Popular',
    metaphorFamily: 'Collective Effort',
  },
  {
    id: 'Ascent',
    label: 'Ascent & Progress (Rising Terrain)',
    description: 'Stepped trajectories, rising mountain ridges, elevation gradients honoring steep climbs.',
    badge: 'High Impact',
    metaphorFamily: 'Growth',
  },
  {
    id: 'Breakthrough',
    label: 'Breakthrough (Threshold & Opening)',
    description: 'Architectural doorway, fractured perimeter giving way to radiant light and emerging possibility.',
    badge: 'Innovation',
    metaphorFamily: 'Discovery',
  },
  {
    id: 'Resilience',
    label: 'Resilience (Strata & Rooted Arch)',
    description: 'Deep geological strata layers, rooted keystone arch weathering immense challenges with grace.',
    metaphorFamily: 'Endurance',
  },
  {
    id: 'Leadership',
    label: 'Leadership (Pathmaker & Updraft)',
    description: 'Dynamic upward current lifting adjacent paths, central guiding contour that elevates others.',
    badge: 'Executive',
    metaphorFamily: 'Impact',
  },
  {
    id: 'Legacy & Time',
    label: 'Legacy Strata (Timeline & Rings)',
    description: 'Annual growth rings, accumulating sediment lines celebrating sustained long-term dedication.',
    metaphorFamily: 'Milestone',
  },
  {
    id: 'Stewardship',
    label: 'Stewardship (Protected Void)',
    description: 'Organic protective contour surrounding and safeguarding a delicate central negative-space aperture.',
    badge: 'Eco DNA',
    metaphorFamily: 'Sustainability',
  },
  {
    id: 'Precision',
    label: 'Precision (Singular Target)',
    description: 'Crisp alignment marks, intersecting focal lines, laser-sharp geometric calibration.',
    metaphorFamily: 'Excellence',
  },
];

// EcoTrophy Authentic Planar Sandwich Material Layer Stacks
export const ECOTROPHY_LAYER_STACKS: StudioOptionItem[] = [
  {
    id: '18mm Rubberwood + 3mm Printed Acrylic + 18mm Wood Frame',
    label: 'Signature 3-Layer Sandwich',
    description: '18mm rear natural rubberwood + 3mm UV printed acrylic art + 18mm front wood contour. High tactile depth.',
    badge: 'Flagship DNA',
  },
  {
    id: '18mm Natural Rubberwood + 3mm Frosted Acrylic Accent',
    label: 'Minimalist Dual Layer',
    description: '18mm planar wood silhouette with an overlapping 3mm frosted acrylic narrative accent. Flat CNC edges.',
    badge: 'Cost-Effective',
  },
  {
    id: '18mm Matte Black Stained Wood + 3mm Clear Transparent Acrylic',
    label: 'Executive Midnight & Glass',
    description: '18mm ebonized black matte wood contour paired with high-clarity printed acrylic void window.',
    badge: 'Executive',
  },
  {
    id: '18mm Solid Rubberwood with Direct High-Precision UV Print',
    label: 'Direct Wood Grain Print',
    description: 'Single continuous 18mm self-standing rubberwood piece with direct multi-layer UV cure graphics.',
  },
];

// EcoTrophy Integrated Self-Standing Silhouettes (NO separate pedestal)
export const ECOTROPHY_INTEGRATED_SILHOUETTES: StudioOptionItem[] = [
  {
    id: 'Continuous Broadened Lower Footprint (Self-Standing)',
    label: 'Natural Broadened Stance (Self-Standing)',
    description: 'Contour organically widens at the bottom to create a stable tipping-resistant footprint. Zero attached pedestal.',
    badge: 'Standard DNA',
  },
  {
    id: 'Interlocking Twin Waves Integrated Base',
    label: 'Dual Flowing Contour Stance',
    description: 'Two sweeping wood curves meeting seamlessly at the floor plane in a wide, stable contact zone.',
  },
  {
    id: 'Architectural Monolith with Offset Geometric Foot',
    label: 'Geometric Monolith Stance',
    description: 'Asymmetric solid pillar with low center of gravity and integrated horizontal base extension.',
  },
  {
    id: 'Cathedral Arch Aperture Stance',
    label: 'Rooted Arch Stance',
    description: 'Two supportive outer pilasters grounded firmly on the table with an open negative-space archway.',
  },
];

// Trophy Standard Heights
export const ECOTROPHY_HEIGHTS: StudioOptionItem[] = [
  {
    id: '8-inch (200mm)',
    label: '8 Inch (Compact Recognition)',
    description: 'Perfect for desktop display, department milestones, and bulk corporate ceremonies.',
  },
  {
    id: '10-inch (250mm)',
    label: '10 Inch (Premier Executive)',
    description: 'The golden ratio standard for EcoTrophy awards. Commanding presence with optimal CNC yield.',
    badge: 'Most Popular',
  },
  {
    id: '12-inch (300mm)',
    label: '12 Inch (Grand Milestone)',
    description: 'Hero scale for annual galas, lifetime honors, and standout top achievers.',
    badge: 'Hero',
  },
  {
    id: '16-inch (400mm)',
    label: '16 Inch (Oversized Centerpiece)',
    description: 'Monumental scale for company-wide perpetual or championship team awards.',
  },
];

// EcoTrophy Surface Finishes & UV Print Treatments
export const ECOTROPHY_FINISHES: StudioOptionItem[] = [
  {
    id: 'Natural Waxed Matte Wood with Opaque White Backed UV Print',
    label: 'Natural Matte Waxed + Vivid UV Print',
    description: 'Silky tactile hand-rubbed wood wax + high-opacity vibrant UV color backing.',
    badge: 'Recommended',
  },
  {
    id: 'Satin Clear Lacquered Wood with Translucent Acrylic Gradient',
    label: 'Satin Clear + Translucent Gradient',
    description: 'Light-catching wood sheen paired with semi-transparent stained glass acrylic effect.',
  },
  {
    id: 'Dark Charcoal Wood Stain with Crisp White Minimalist Typography',
    label: 'Charcoal Stain + Pure White Type',
    description: 'Moody modern contrast highlighting precision typographic hierarchy.',
  },
];
