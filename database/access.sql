-- Run after creating the dedicated caseflow_demo_app LOGIN role.
GRANT USAGE ON SCHEMA caseflow_demo TO caseflow_demo_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON caseflow_demo.tickets, caseflow_demo.sessions TO caseflow_demo_app;
GRANT USAGE, SELECT, UPDATE ON SEQUENCE caseflow_demo.tickets_id_seq TO caseflow_demo_app;

CREATE POLICY caseflow_backend_access ON caseflow_demo.tickets
  FOR ALL TO caseflow_demo_app USING (true) WITH CHECK (true);
CREATE POLICY caseflow_backend_access ON caseflow_demo.sessions
  FOR ALL TO caseflow_demo_app USING (true) WITH CHECK (true);
