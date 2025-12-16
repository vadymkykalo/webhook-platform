ALTER TABLE projects ADD COLUMN organization_id UUID;

CREATE INDEX idx_projects_organization_id ON projects(organization_id);

DO $$
DECLARE
    default_org_id UUID;
BEGIN
    IF EXISTS (SELECT 1 FROM projects WHERE organization_id IS NULL) THEN
        INSERT INTO organizations (name, created_at) 
        VALUES ('Default Organization', CURRENT_TIMESTAMP)
        RETURNING id INTO default_org_id;
        
        UPDATE projects SET organization_id = default_org_id WHERE organization_id IS NULL;
    END IF;
END $$;

ALTER TABLE projects ALTER COLUMN organization_id SET NOT NULL;

ALTER TABLE projects ADD CONSTRAINT fk_projects_organization FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;
