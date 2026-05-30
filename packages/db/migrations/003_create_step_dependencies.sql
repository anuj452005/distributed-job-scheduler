CREATE TABLE step_dependencies (
  step_id            UUID NOT NULL REFERENCES workflow_steps(id) ON DELETE CASCADE,
  depends_on_step_id UUID NOT NULL REFERENCES workflow_steps(id) ON DELETE CASCADE,
  PRIMARY KEY (step_id, depends_on_step_id)
);
