export interface Lead {
  id?: string;
  name?: string;
  phone?: string;
  email?: string;
  company?: string;
  location?: string;
  source?: string;
  platform?: string;
  status?: string;
  pipeline_id?: string;
  stage_id?: string;
  is_repeat_customer?: boolean;
  customer_lifecycle?: string;
  required_quantity?: number | string;
  value?: number | string;
  event_name?: string;
  event_type?: string;
  event_date?: string;
  delivery_date?: string;
  trophy_type?: string;
  trophy_size?: string;
  budget?: string;
  organization?: string;
  customer_type?: string;
  urgency?: string;
  notes?: string;
}

export interface PipelineStage {
  id: string;
  label: string;
  required_fields?: string[];
}

export interface Pipeline {
  id: string;
  name: string;
  scenario?: string;
  is_default?: boolean;
  stages: PipelineStage[];
}

export interface PipelineRule {
  id?: string;
  pipeline_id: string;
  name: string;
  description?: string;
  field: string;
  operator: string;
  value: any;
  secondary_value?: any;
  priority?: number;
  is_active: boolean;
}
