-- NOT a second schema. Adds the columns that already exist in the verified sqlite corpus.
-- Safe to rerun.

alter table source_records add column if not exists record_role text;

alter table measurements add column if not exists classification_reason text;
alter table measurements add column if not exists classification_version text;
alter table measurements add column if not exists unit_original text;
alter table measurements add column if not exists unit_normalized text;
alter table measurements add column if not exists unit_status text;
alter table measurements add column if not exists parser_version text;
alter table measurements add column if not exists normalization_version text;

alter table canonical_entities add column if not exists homonym_status text;
alter table canonical_entities add column if not exists entity_class text;

alter table claims add column if not exists claim_text text;
alter table claims add column if not exists claim_status text;
