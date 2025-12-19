-- Fix function search_path for update_updated_at_column
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- Drop and recreate RLS policies for tables that need office-level filtering

-- 1. oncall_assignments - filter by user's offices
DROP POLICY IF EXISTS "Allow authenticated read access to oncall_assignments" ON oncall_assignments;
DROP POLICY IF EXISTS "Allow authenticated insert to oncall_assignments" ON oncall_assignments;
DROP POLICY IF EXISTS "Allow authenticated update to oncall_assignments" ON oncall_assignments;

CREATE POLICY "Users can read their office assignments"
ON oncall_assignments FOR SELECT TO authenticated
USING (
  office_id IN (SELECT office_id FROM user_offices WHERE user_id = auth.uid())
  OR has_role(auth.uid(), 'admin')
);

CREATE POLICY "Admins and managers can insert assignments"
ON oncall_assignments FOR INSERT TO authenticated
WITH CHECK (
  (office_id IN (SELECT office_id FROM user_offices WHERE user_id = auth.uid())
   AND (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'manager')))
);

CREATE POLICY "Admins and managers can update assignments"
ON oncall_assignments FOR UPDATE TO authenticated
USING (
  office_id IN (SELECT office_id FROM user_offices WHERE user_id = auth.uid())
  AND (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'manager'))
)
WITH CHECK (
  office_id IN (SELECT office_id FROM user_offices WHERE user_id = auth.uid())
  AND (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'manager'))
);

-- 2. oncall_swap_requests - filter by user's offices
DROP POLICY IF EXISTS "Allow authenticated read access to oncall_swap_requests" ON oncall_swap_requests;
DROP POLICY IF EXISTS "Allow authenticated insert to oncall_swap_requests" ON oncall_swap_requests;
DROP POLICY IF EXISTS "Allow authenticated update to oncall_swap_requests" ON oncall_swap_requests;

CREATE POLICY "Users can read their office swap requests"
ON oncall_swap_requests FOR SELECT TO authenticated
USING (
  office_id IN (SELECT office_id FROM user_offices WHERE user_id = auth.uid())
  OR has_role(auth.uid(), 'admin')
);

CREATE POLICY "Users can create swap requests for their offices"
ON oncall_swap_requests FOR INSERT TO authenticated
WITH CHECK (
  office_id IN (SELECT office_id FROM user_offices WHERE user_id = auth.uid())
  AND requesting_user_id = auth.uid()
);

CREATE POLICY "Managers can update swap requests"
ON oncall_swap_requests FOR UPDATE TO authenticated
USING (
  office_id IN (SELECT office_id FROM user_offices WHERE user_id = auth.uid())
  AND (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'manager'))
)
WITH CHECK (
  office_id IN (SELECT office_id FROM user_offices WHERE user_id = auth.uid())
  AND (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'manager'))
);

-- 3. sla_policies - filter by user's offices
DROP POLICY IF EXISTS "Allow authenticated read access to sla_policies" ON sla_policies;
DROP POLICY IF EXISTS "Allow authenticated manage sla_policies" ON sla_policies;

CREATE POLICY "Users can read their office SLA policies"
ON sla_policies FOR SELECT TO authenticated
USING (
  office_id IN (SELECT office_id FROM user_offices WHERE user_id = auth.uid())
  OR has_role(auth.uid(), 'admin')
);

CREATE POLICY "Admins can manage SLA policies"
ON sla_policies FOR ALL TO authenticated
USING (has_role(auth.uid(), 'admin'))
WITH CHECK (has_role(auth.uid(), 'admin'));

-- 4. sla_results - filter by user's offices
DROP POLICY IF EXISTS "Allow authenticated read access to sla_results" ON sla_results;
DROP POLICY IF EXISTS "Allow service role full access to sla_results" ON sla_results;

CREATE POLICY "Users can read their office SLA results"
ON sla_results FOR SELECT TO authenticated
USING (
  office_id IN (SELECT office_id FROM user_offices WHERE user_id = auth.uid())
  OR has_role(auth.uid(), 'admin')
);

CREATE POLICY "Service role can manage SLA results"
ON sla_results FOR ALL TO service_role
USING (true)
WITH CHECK (true);

-- 5. compliance_alert_configs - filter by user's offices
DROP POLICY IF EXISTS "Users can view compliance alert configs" ON compliance_alert_configs;
DROP POLICY IF EXISTS "Admins can manage compliance alert configs" ON compliance_alert_configs;

CREATE POLICY "Users can view their office compliance configs"
ON compliance_alert_configs FOR SELECT TO authenticated
USING (
  office_id::text IN (SELECT office_id FROM user_offices WHERE user_id = auth.uid())
  OR has_role(auth.uid(), 'admin')
);

CREATE POLICY "Admins can manage compliance alert configs"
ON compliance_alert_configs FOR ALL TO authenticated
USING (has_role(auth.uid(), 'admin'))
WITH CHECK (has_role(auth.uid(), 'admin'));

-- 6. compliance_alerts - filter by user's offices
DROP POLICY IF EXISTS "Users can view compliance alerts" ON compliance_alerts;
DROP POLICY IF EXISTS "System can insert compliance alerts" ON compliance_alerts;

CREATE POLICY "Users can view their office compliance alerts"
ON compliance_alerts FOR SELECT TO authenticated
USING (
  office_id::text IN (SELECT office_id FROM user_offices WHERE user_id = auth.uid())
  OR has_role(auth.uid(), 'admin')
);

CREATE POLICY "Service role can insert compliance alerts"
ON compliance_alerts FOR INSERT TO service_role
WITH CHECK (true);

-- 7. provider_routing_config - filter by user's offices
DROP POLICY IF EXISTS "Allow authenticated read access to provider_routing_config" ON provider_routing_config;
DROP POLICY IF EXISTS "Allow authenticated manage provider_routing_config" ON provider_routing_config;

CREATE POLICY "Users can read their office routing config"
ON provider_routing_config FOR SELECT TO authenticated
USING (
  office_id IN (SELECT office_id FROM user_offices WHERE user_id = auth.uid())
  OR has_role(auth.uid(), 'admin')
);

CREATE POLICY "Admins can manage routing config"
ON provider_routing_config FOR ALL TO authenticated
USING (has_role(auth.uid(), 'admin'))
WITH CHECK (has_role(auth.uid(), 'admin'));

-- 8. provider_routing_audit_logs - filter by user's offices (via config)
DROP POLICY IF EXISTS "Users can view routing audit logs" ON provider_routing_audit_logs;
DROP POLICY IF EXISTS "Users can insert routing audit logs" ON provider_routing_audit_logs;

CREATE POLICY "Users can view routing audit logs"
ON provider_routing_audit_logs FOR SELECT TO authenticated
USING (
  provider_routing_config_id IN (
    SELECT id FROM provider_routing_config 
    WHERE office_id IN (SELECT office_id FROM user_offices WHERE user_id = auth.uid())
  )
  OR has_role(auth.uid(), 'admin')
);

CREATE POLICY "Admins can insert routing audit logs"
ON provider_routing_audit_logs FOR INSERT TO authenticated
WITH CHECK (has_role(auth.uid(), 'admin'));

-- 9. oncall_assignment_audit_logs - filter by user's offices
DROP POLICY IF EXISTS "Users can view oncall assignment audit logs" ON oncall_assignment_audit_logs;
DROP POLICY IF EXISTS "Users can insert oncall assignment audit logs" ON oncall_assignment_audit_logs;

CREATE POLICY "Users can view their office audit logs"
ON oncall_assignment_audit_logs FOR SELECT TO authenticated
USING (
  office_id IN (SELECT office_id FROM user_offices WHERE user_id = auth.uid())
  OR has_role(auth.uid(), 'admin')
);

CREATE POLICY "Managers can insert audit logs"
ON oncall_assignment_audit_logs FOR INSERT TO authenticated
WITH CHECK (
  office_id IN (SELECT office_id FROM user_offices WHERE user_id = auth.uid())
  AND (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'manager'))
);

-- 10. access_reviews - filter by company (from profiles)
DROP POLICY IF EXISTS "Allow authenticated read access to access_reviews" ON access_reviews;
DROP POLICY IF EXISTS "Allow authenticated manage access_reviews" ON access_reviews;

CREATE POLICY "Users can read company access reviews"
ON access_reviews FOR SELECT TO authenticated
USING (
  company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid() AND company_id IS NOT NULL)
  OR has_role(auth.uid(), 'admin')
);

CREATE POLICY "Admins can manage access reviews"
ON access_reviews FOR ALL TO authenticated
USING (has_role(auth.uid(), 'admin'))
WITH CHECK (has_role(auth.uid(), 'admin'));

-- 11. access_review_items - filter via access_review company
DROP POLICY IF EXISTS "Allow authenticated read access to access_review_items" ON access_review_items;
DROP POLICY IF EXISTS "Allow authenticated manage access_review_items" ON access_review_items;

CREATE POLICY "Users can read company access review items"
ON access_review_items FOR SELECT TO authenticated
USING (
  access_review_id IN (
    SELECT id FROM access_reviews 
    WHERE company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid() AND company_id IS NOT NULL)
  )
  OR has_role(auth.uid(), 'admin')
);

CREATE POLICY "Admins can manage access review items"
ON access_review_items FOR ALL TO authenticated
USING (has_role(auth.uid(), 'admin'))
WITH CHECK (has_role(auth.uid(), 'admin'));

-- 12. evidence_exports - filter by company
DROP POLICY IF EXISTS "Allow authenticated read access to evidence_exports" ON evidence_exports;
DROP POLICY IF EXISTS "Allow authenticated insert to evidence_exports" ON evidence_exports;

CREATE POLICY "Users can read their company exports"
ON evidence_exports FOR SELECT TO authenticated
USING (
  company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid() AND company_id IS NOT NULL)
  OR has_role(auth.uid(), 'admin')
);

CREATE POLICY "Users can request exports for their company"
ON evidence_exports FOR INSERT TO authenticated
WITH CHECK (
  company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid() AND company_id IS NOT NULL)
  AND requested_by_user_id = auth.uid()
);

-- 13. policy_attestations - users can only read/create their own
DROP POLICY IF EXISTS "Allow authenticated read access to policy_attestations" ON policy_attestations;
DROP POLICY IF EXISTS "Allow authenticated insert to policy_attestations" ON policy_attestations;

CREATE POLICY "Users can read their own attestations"
ON policy_attestations FOR SELECT TO authenticated
USING (
  user_id = auth.uid()
  OR has_role(auth.uid(), 'admin')
);

CREATE POLICY "Users can create their own attestations"
ON policy_attestations FOR INSERT TO authenticated
WITH CHECK (user_id = auth.uid());