-- NOT APPLIED. Schema only. Do not run against production in this phase.
-- Health evidence is stored separately from seller claims and from measurements.
-- A missing row is not evidence of absence. A compound finding is not a strain cure.

create table if not exists public.health_evidence (
  id text primary key,
  subject_name text not null,
  identity_status text,
  effect_domain text not null,
  evidence_class text not null,
  attribution text not null,
  evidence_strength text,
  population text,
  dose text,
  formulation text,
  route text,
  study_design text,
  source text,
  limitations text,
  evidence_date date,
  provenance text not null,
  study_id text,
  methodological_quality text,
  chemotype_id text,
  compound text,
  outcome text,
  causal boolean not null default false,
  testimony boolean not null default false,
  primary_source_ids jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  constraint health_evidence_domain check (effect_domain in (
    'BIOLOGICAL', 'PHARMACOLOGICAL', 'THERAPEUTIC', 'POSSIBLE_BENEFIT', 'RISK', 'ADVERSE_EVENT', 'TOXICITY',
    'PHYSIOLOGICAL', 'NEUROLOGICAL', 'IMMUNOLOGICAL', 'CARDIOVASCULAR', 'METABOLIC', 'DRUG_INTERACTION', 'CLINICAL_OUTCOME'
  )),
  constraint health_evidence_class check (evidence_class in (
    'PRECLINICAL', 'IN_VITRO', 'ANIMAL', 'OBSERVATIONAL', 'CLINICAL', 'SYSTEMATIC_REVIEW', 'META_ANALYSIS', 'PRIMARY'
  )),
  constraint health_evidence_attribution check (attribution in (
    'DIRECT_STRAIN_EVIDENCE', 'STRAIN_CHEMOTYPE_LINK', 'COMPOUND_LEVEL_EVIDENCE', 'FORMULATION_LEVEL_EVIDENCE',
    'CLASS_LEVEL_EVIDENCE', 'PRECLINICAL_ONLY', 'OBSERVATIONAL_ONLY', 'CLINICAL_EVIDENCE', 'INSUFFICIENT_EVIDENCE'
  )),
  constraint health_evidence_not_testimony check (testimony = false),
  constraint health_evidence_observational_not_causal check (evidence_class <> 'OBSERVATIONAL' or causal = false),
  constraint health_evidence_preclinical_not_clinical check (
    evidence_class not in ('PRECLINICAL', 'IN_VITRO', 'ANIMAL') or attribution <> 'CLINICAL_EVIDENCE'
  ),
  constraint health_evidence_direct_requires_identity check (
    attribution <> 'DIRECT_STRAIN_EVIDENCE' or identity_status = 'VERIFIED'
  ),
  constraint health_evidence_chemotype_link_documented check (
    attribution <> 'STRAIN_CHEMOTYPE_LINK' or chemotype_id is not null
  )
);

create table if not exists public.health_evidence_edges (
  id text primary key,
  evidence_id text not null references public.health_evidence (id),
  relation text not null,
  from_id text not null,
  to_id text not null,
  provenance text not null,
  constraint health_edge_relation check (relation in ('HAS_MEASURED_CHEMOTYPE', 'CONTAINS_COMPOUND', 'SUPPORTED_BY', 'REPORTS_OUTCOME')),
  constraint health_edge_not_cure check (relation <> 'CURES')
);

create index if not exists health_evidence_subject_idx on public.health_evidence (subject_name);
create index if not exists health_evidence_attribution_idx on public.health_evidence (attribution);
