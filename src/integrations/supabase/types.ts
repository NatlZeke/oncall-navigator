export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      access_review_items: {
        Row: {
          access_review_id: string
          created_at: string
          id: string
          last_login_at: string | null
          reviewer_notes: string | null
          role_summary: Json
          status: Database["public"]["Enums"]["review_item_status"]
          updated_at: string
          user_id: string
        }
        Insert: {
          access_review_id: string
          created_at?: string
          id?: string
          last_login_at?: string | null
          reviewer_notes?: string | null
          role_summary?: Json
          status?: Database["public"]["Enums"]["review_item_status"]
          updated_at?: string
          user_id: string
        }
        Update: {
          access_review_id?: string
          created_at?: string
          id?: string
          last_login_at?: string | null
          reviewer_notes?: string | null
          role_summary?: Json
          status?: Database["public"]["Enums"]["review_item_status"]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "access_review_items_access_review_id_fkey"
            columns: ["access_review_id"]
            isOneToOne: false
            referencedRelation: "access_reviews"
            referencedColumns: ["id"]
          },
        ]
      }
      access_reviews: {
        Row: {
          company_id: string
          created_at: string
          created_by_user_id: string
          id: string
          published_at: string | null
          review_period_end: string
          review_period_start: string
          status: Database["public"]["Enums"]["review_status"]
        }
        Insert: {
          company_id: string
          created_at?: string
          created_by_user_id: string
          id?: string
          published_at?: string | null
          review_period_end: string
          review_period_start: string
          status?: Database["public"]["Enums"]["review_status"]
        }
        Update: {
          company_id?: string
          created_at?: string
          created_by_user_id?: string
          id?: string
          published_at?: string | null
          review_period_end?: string
          review_period_start?: string
          status?: Database["public"]["Enums"]["review_status"]
        }
        Relationships: []
      }
      admin_profile_access_logs: {
        Row: {
          access_type: string
          accessed_at: string
          accessed_profile_id: string | null
          admin_user_id: string
          id: string
          query_context: string | null
        }
        Insert: {
          access_type?: string
          accessed_at?: string
          accessed_profile_id?: string | null
          admin_user_id: string
          id?: string
          query_context?: string | null
        }
        Update: {
          access_type?: string
          accessed_at?: string
          accessed_profile_id?: string | null
          admin_user_id?: string
          id?: string
          query_context?: string | null
        }
        Relationships: []
      }
      authorized_email_access_logs: {
        Row: {
          accessed_at: string
          action: string
          admin_user_id: string
          id: string
          query_context: string | null
        }
        Insert: {
          accessed_at?: string
          action?: string
          admin_user_id: string
          id?: string
          query_context?: string | null
        }
        Update: {
          accessed_at?: string
          action?: string
          admin_user_id?: string
          id?: string
          query_context?: string | null
        }
        Relationships: []
      }
      authorized_emails: {
        Row: {
          authorized_at: string
          authorized_by_user_id: string | null
          created_at: string
          email: string
          full_name: string | null
          id: string
          phone: string | null
          used_at: string | null
        }
        Insert: {
          authorized_at?: string
          authorized_by_user_id?: string | null
          created_at?: string
          email: string
          full_name?: string | null
          id?: string
          phone?: string | null
          used_at?: string | null
        }
        Update: {
          authorized_at?: string
          authorized_by_user_id?: string | null
          created_at?: string
          email?: string
          full_name?: string | null
          id?: string
          phone?: string | null
          used_at?: string | null
        }
        Relationships: []
      }
      compliance_alert_configs: {
        Row: {
          alert_type: string
          check_interval_hours: number
          created_at: string
          enabled: boolean
          id: string
          notify_email: string[] | null
          notify_phone: string[] | null
          office_id: string
          threshold_percent: number
          updated_at: string
        }
        Insert: {
          alert_type?: string
          check_interval_hours?: number
          created_at?: string
          enabled?: boolean
          id?: string
          notify_email?: string[] | null
          notify_phone?: string[] | null
          office_id: string
          threshold_percent?: number
          updated_at?: string
        }
        Update: {
          alert_type?: string
          check_interval_hours?: number
          created_at?: string
          enabled?: boolean
          id?: string
          notify_email?: string[] | null
          notify_phone?: string[] | null
          office_id?: string
          threshold_percent?: number
          updated_at?: string
        }
        Relationships: []
      }
      compliance_alerts: {
        Row: {
          alert_type: string
          config_id: string | null
          created_at: string
          current_value: number
          id: string
          message: string
          notifications_sent: Json | null
          office_id: string
          threshold_value: number
        }
        Insert: {
          alert_type: string
          config_id?: string | null
          created_at?: string
          current_value: number
          id?: string
          message: string
          notifications_sent?: Json | null
          office_id: string
          threshold_value: number
        }
        Update: {
          alert_type?: string
          config_id?: string | null
          created_at?: string
          current_value?: number
          id?: string
          message?: string
          notifications_sent?: Json | null
          office_id?: string
          threshold_value?: number
        }
        Relationships: [
          {
            foreignKeyName: "compliance_alerts_config_id_fkey"
            columns: ["config_id"]
            isOneToOne: false
            referencedRelation: "compliance_alert_configs"
            referencedColumns: ["id"]
          },
        ]
      }
      escalation_events: {
        Row: {
          created_at: string
          escalation_id: string
          event_time: string
          event_type: Database["public"]["Enums"]["escalation_event_type"]
          id: string
          payload: Json | null
        }
        Insert: {
          created_at?: string
          escalation_id: string
          event_time?: string
          event_type: Database["public"]["Enums"]["escalation_event_type"]
          id?: string
          payload?: Json | null
        }
        Update: {
          created_at?: string
          escalation_id?: string
          event_time?: string
          event_type?: Database["public"]["Enums"]["escalation_event_type"]
          id?: string
          payload?: Json | null
        }
        Relationships: []
      }
      escalations: {
        Row: {
          ack_type: string | null
          acknowledged_at: string | null
          assigned_provider_name: string | null
          assigned_provider_phone: string | null
          assigned_provider_user_id: string | null
          call_sid: string | null
          callback_completed_at: string | null
          callback_connected_at: string | null
          callback_ended_at: string | null
          callback_failure_reason: string | null
          callback_initiated_at: string | null
          callback_number: string
          callback_started_at: string | null
          callback_status: string | null
          conversation_id: string | null
          created_at: string
          current_tier: number
          date_of_birth: string | null
          disposition_override: string | null
          has_recent_surgery: boolean | null
          id: string
          is_established_patient: boolean | null
          office_id: string
          patient_call_sid: string | null
          patient_name: string | null
          primary_complaint: string | null
          provider_call_sid: string | null
          provider_reply: string | null
          provider_reply_at: string | null
          resolution_notes: string | null
          resolved_at: string | null
          sla_target_minutes: number
          sla_warning_minutes: number
          sms_body: string | null
          sms_template_used: string | null
          sms_twilio_sid: string | null
          status: string
          structured_summary: Json
          summary_sent_at: string | null
          symptoms: Json | null
          triage_level: string
          updated_at: string
        }
        Insert: {
          ack_type?: string | null
          acknowledged_at?: string | null
          assigned_provider_name?: string | null
          assigned_provider_phone?: string | null
          assigned_provider_user_id?: string | null
          call_sid?: string | null
          callback_completed_at?: string | null
          callback_connected_at?: string | null
          callback_ended_at?: string | null
          callback_failure_reason?: string | null
          callback_initiated_at?: string | null
          callback_number: string
          callback_started_at?: string | null
          callback_status?: string | null
          conversation_id?: string | null
          created_at?: string
          current_tier?: number
          date_of_birth?: string | null
          disposition_override?: string | null
          has_recent_surgery?: boolean | null
          id?: string
          is_established_patient?: boolean | null
          office_id: string
          patient_call_sid?: string | null
          patient_name?: string | null
          primary_complaint?: string | null
          provider_call_sid?: string | null
          provider_reply?: string | null
          provider_reply_at?: string | null
          resolution_notes?: string | null
          resolved_at?: string | null
          sla_target_minutes?: number
          sla_warning_minutes?: number
          sms_body?: string | null
          sms_template_used?: string | null
          sms_twilio_sid?: string | null
          status?: string
          structured_summary?: Json
          summary_sent_at?: string | null
          symptoms?: Json | null
          triage_level: string
          updated_at?: string
        }
        Update: {
          ack_type?: string | null
          acknowledged_at?: string | null
          assigned_provider_name?: string | null
          assigned_provider_phone?: string | null
          assigned_provider_user_id?: string | null
          call_sid?: string | null
          callback_completed_at?: string | null
          callback_connected_at?: string | null
          callback_ended_at?: string | null
          callback_failure_reason?: string | null
          callback_initiated_at?: string | null
          callback_number?: string
          callback_started_at?: string | null
          callback_status?: string | null
          conversation_id?: string | null
          created_at?: string
          current_tier?: number
          date_of_birth?: string | null
          disposition_override?: string | null
          has_recent_surgery?: boolean | null
          id?: string
          is_established_patient?: boolean | null
          office_id?: string
          patient_call_sid?: string | null
          patient_name?: string | null
          primary_complaint?: string | null
          provider_call_sid?: string | null
          provider_reply?: string | null
          provider_reply_at?: string | null
          resolution_notes?: string | null
          resolved_at?: string | null
          sla_target_minutes?: number
          sla_warning_minutes?: number
          sms_body?: string | null
          sms_template_used?: string | null
          sms_twilio_sid?: string | null
          status?: string
          structured_summary?: Json
          summary_sent_at?: string | null
          symptoms?: Json | null
          triage_level?: string
          updated_at?: string
        }
        Relationships: []
      }
      evidence_exports: {
        Row: {
          company_id: string
          created_at: string
          file_url: string | null
          id: string
          parameters: Json
          requested_by_user_id: string
          status: string
          type: Database["public"]["Enums"]["evidence_type"]
        }
        Insert: {
          company_id: string
          created_at?: string
          file_url?: string | null
          id?: string
          parameters?: Json
          requested_by_user_id: string
          status?: string
          type: Database["public"]["Enums"]["evidence_type"]
        }
        Update: {
          company_id?: string
          created_at?: string
          file_url?: string | null
          id?: string
          parameters?: Json
          requested_by_user_id?: string
          status?: string
          type?: Database["public"]["Enums"]["evidence_type"]
        }
        Relationships: []
      }
      notification_logs: {
        Row: {
          content: Json | null
          created_at: string
          id: string
          metadata: Json | null
          notification_type: string
          office_id: string | null
          recipient_phone: string | null
          recipient_user_id: string | null
          status: string
          twilio_sid: string | null
        }
        Insert: {
          content?: Json | null
          created_at?: string
          id?: string
          metadata?: Json | null
          notification_type: string
          office_id?: string | null
          recipient_phone?: string | null
          recipient_user_id?: string | null
          status?: string
          twilio_sid?: string | null
        }
        Update: {
          content?: Json | null
          created_at?: string
          id?: string
          metadata?: Json | null
          notification_type?: string
          office_id?: string | null
          recipient_phone?: string | null
          recipient_user_id?: string | null
          status?: string
          twilio_sid?: string | null
        }
        Relationships: []
      }
      office_settings: {
        Row: {
          auto_escalation_enabled: boolean | null
          auto_escalation_minutes: number | null
          max_consecutive_shifts_warning: number | null
          office_id: string
          publish_locks_schedule: boolean | null
          require_admin_approval_for_swaps: boolean | null
          require_backup_provider: boolean | null
          updated_at: string | null
        }
        Insert: {
          auto_escalation_enabled?: boolean | null
          auto_escalation_minutes?: number | null
          max_consecutive_shifts_warning?: number | null
          office_id: string
          publish_locks_schedule?: boolean | null
          require_admin_approval_for_swaps?: boolean | null
          require_backup_provider?: boolean | null
          updated_at?: string | null
        }
        Update: {
          auto_escalation_enabled?: boolean | null
          auto_escalation_minutes?: number | null
          max_consecutive_shifts_warning?: number | null
          office_id?: string
          publish_locks_schedule?: boolean | null
          require_admin_approval_for_swaps?: boolean | null
          require_backup_provider?: boolean | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "office_settings_office_id_fkey"
            columns: ["office_id"]
            isOneToOne: true
            referencedRelation: "offices"
            referencedColumns: ["id"]
          },
        ]
      }
      offices: {
        Row: {
          business_hours_end: string | null
          business_hours_start: string | null
          created_at: string | null
          id: string
          is_active: boolean | null
          name: string
          phone_numbers: string[]
          spanish_enabled: boolean
          timezone: string | null
          updated_at: string | null
        }
        Insert: {
          business_hours_end?: string | null
          business_hours_start?: string | null
          created_at?: string | null
          id: string
          is_active?: boolean | null
          name: string
          phone_numbers?: string[]
          spanish_enabled?: boolean
          timezone?: string | null
          updated_at?: string | null
        }
        Update: {
          business_hours_end?: string | null
          business_hours_start?: string | null
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
          phone_numbers?: string[]
          spanish_enabled?: boolean
          timezone?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      oncall_assignment_audit_logs: {
        Row: {
          action: string
          assignment_date: string
          changed_by_user_id: string | null
          created_at: string
          id: string
          new_values: Json | null
          office_id: string
          oncall_assignment_id: string
          previous_values: Json | null
        }
        Insert: {
          action: string
          assignment_date: string
          changed_by_user_id?: string | null
          created_at?: string
          id?: string
          new_values?: Json | null
          office_id: string
          oncall_assignment_id: string
          previous_values?: Json | null
        }
        Update: {
          action?: string
          assignment_date?: string
          changed_by_user_id?: string | null
          created_at?: string
          id?: string
          new_values?: Json | null
          office_id?: string
          oncall_assignment_id?: string
          previous_values?: Json | null
        }
        Relationships: []
      }
      oncall_assignments: {
        Row: {
          after_hours_end: string
          after_hours_start: string
          assignment_date: string
          created_at: string
          id: string
          office_id: string
          provider_name: string
          provider_phone: string
          provider_user_id: string
          status: string
          updated_at: string
        }
        Insert: {
          after_hours_end?: string
          after_hours_start?: string
          assignment_date: string
          created_at?: string
          id?: string
          office_id: string
          provider_name: string
          provider_phone: string
          provider_user_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          after_hours_end?: string
          after_hours_start?: string
          assignment_date?: string
          created_at?: string
          id?: string
          office_id?: string
          provider_name?: string
          provider_phone?: string
          provider_user_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      oncall_swap_requests: {
        Row: {
          created_at: string
          id: string
          office_id: string
          original_assignment_id: string
          reason: string | null
          requesting_user_id: string
          requesting_user_name: string
          reviewed_at: string | null
          reviewed_by_user_id: string | null
          reviewer_notes: string | null
          status: string
          swap_date: string
          target_user_id: string | null
          target_user_name: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          office_id: string
          original_assignment_id: string
          reason?: string | null
          requesting_user_id: string
          requesting_user_name: string
          reviewed_at?: string | null
          reviewed_by_user_id?: string | null
          reviewer_notes?: string | null
          status?: string
          swap_date: string
          target_user_id?: string | null
          target_user_name?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          office_id?: string
          original_assignment_id?: string
          reason?: string | null
          requesting_user_id?: string
          requesting_user_name?: string
          reviewed_at?: string | null
          reviewed_by_user_id?: string | null
          reviewer_notes?: string | null
          status?: string
          swap_date?: string
          target_user_id?: string | null
          target_user_name?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "oncall_swap_requests_original_assignment_id_fkey"
            columns: ["original_assignment_id"]
            isOneToOne: false
            referencedRelation: "oncall_assignments"
            referencedColumns: ["id"]
          },
        ]
      }
      policy_attestations: {
        Row: {
          accepted_at: string
          company_id: string
          created_at: string
          id: string
          ip_address: string | null
          policy_type: string
          policy_version: string
          user_id: string
        }
        Insert: {
          accepted_at?: string
          company_id: string
          created_at?: string
          id?: string
          ip_address?: string | null
          policy_type: string
          policy_version: string
          user_id: string
        }
        Update: {
          accepted_at?: string
          company_id?: string
          created_at?: string
          id?: string
          ip_address?: string | null
          policy_type?: string
          policy_version?: string
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          company_id: string | null
          created_at: string
          email: string | null
          full_name: string | null
          id: string
          office_id: string | null
          phone: string | null
          updated_at: string
        }
        Insert: {
          company_id?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          id: string
          office_id?: string | null
          phone?: string | null
          updated_at?: string
        }
        Update: {
          company_id?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
          office_id?: string | null
          phone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      provider_acknowledgements: {
        Row: {
          ack_time: string
          ack_type: Database["public"]["Enums"]["ack_type"]
          created_at: string
          escalation_id: string
          id: string
          notes: string | null
          office_id: string
          user_id: string
        }
        Insert: {
          ack_time?: string
          ack_type: Database["public"]["Enums"]["ack_type"]
          created_at?: string
          escalation_id: string
          id?: string
          notes?: string | null
          office_id: string
          user_id: string
        }
        Update: {
          ack_time?: string
          ack_type?: Database["public"]["Enums"]["ack_type"]
          created_at?: string
          escalation_id?: string
          id?: string
          notes?: string | null
          office_id?: string
          user_id?: string
        }
        Relationships: []
      }
      provider_routing_audit_logs: {
        Row: {
          action: string
          changed_by_user_id: string | null
          created_at: string
          id: string
          new_values: Json | null
          previous_values: Json | null
          provider_routing_config_id: string
        }
        Insert: {
          action: string
          changed_by_user_id?: string | null
          created_at?: string
          id?: string
          new_values?: Json | null
          previous_values?: Json | null
          provider_routing_config_id: string
        }
        Update: {
          action?: string
          changed_by_user_id?: string | null
          created_at?: string
          id?: string
          new_values?: Json | null
          previous_values?: Json | null
          provider_routing_config_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "provider_routing_audit_logs_provider_routing_config_id_fkey"
            columns: ["provider_routing_config_id"]
            isOneToOne: false
            referencedRelation: "provider_routing_config"
            referencedColumns: ["id"]
          },
        ]
      }
      provider_routing_config: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          match_keywords: string[] | null
          office_id: string
          provider_name: string
          provider_phone: string
          provider_user_id: string
          routing_type: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          match_keywords?: string[] | null
          office_id: string
          provider_name: string
          provider_phone: string
          provider_user_id: string
          routing_type?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          match_keywords?: string[] | null
          office_id?: string
          provider_name?: string
          provider_phone?: string
          provider_user_id?: string
          routing_type?: string
          updated_at?: string
        }
        Relationships: []
      }
      sla_policies: {
        Row: {
          breach_minutes: number
          created_at: string
          id: string
          office_id: string
          service_line_id: string | null
          severity: string
          target_minutes: number
          updated_at: string
          warning_minutes: number
        }
        Insert: {
          breach_minutes?: number
          created_at?: string
          id?: string
          office_id: string
          service_line_id?: string | null
          severity: string
          target_minutes?: number
          updated_at?: string
          warning_minutes?: number
        }
        Update: {
          breach_minutes?: number
          created_at?: string
          id?: string
          office_id?: string
          service_line_id?: string | null
          severity?: string
          target_minutes?: number
          updated_at?: string
          warning_minutes?: number
        }
        Relationships: []
      }
      sla_results: {
        Row: {
          computed_at: string
          escalation_id: string
          id: string
          office_id: string
          service_line_id: string | null
          severity: string
          status: Database["public"]["Enums"]["sla_status"]
          time_to_ack_minutes: number | null
          time_to_resolution_minutes: number | null
        }
        Insert: {
          computed_at?: string
          escalation_id: string
          id?: string
          office_id: string
          service_line_id?: string | null
          severity: string
          status?: Database["public"]["Enums"]["sla_status"]
          time_to_ack_minutes?: number | null
          time_to_resolution_minutes?: number | null
        }
        Update: {
          computed_at?: string
          escalation_id?: string
          id?: string
          office_id?: string
          service_line_id?: string | null
          severity?: string
          status?: Database["public"]["Enums"]["sla_status"]
          time_to_ack_minutes?: number | null
          time_to_resolution_minutes?: number | null
        }
        Relationships: []
      }
      twilio_conversations: {
        Row: {
          call_sid: string
          called_phone: string | null
          caller_phone: string
          conversation_type: string
          created_at: string
          id: string
          metadata: Json | null
          status: string
          transcript: Json | null
          updated_at: string
        }
        Insert: {
          call_sid: string
          called_phone?: string | null
          caller_phone: string
          conversation_type?: string
          created_at?: string
          id?: string
          metadata?: Json | null
          status?: string
          transcript?: Json | null
          updated_at?: string
        }
        Update: {
          call_sid?: string
          called_phone?: string | null
          caller_phone?: string
          conversation_type?: string
          created_at?: string
          id?: string
          metadata?: Json | null
          status?: string
          transcript?: Json | null
          updated_at?: string
        }
        Relationships: []
      }
      user_offices: {
        Row: {
          created_at: string
          id: string
          office_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          office_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          office_id?: string
          user_id?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      webhook_alert_configs: {
        Row: {
          check_window_minutes: number
          created_at: string
          enabled: boolean
          failure_threshold_percent: number
          id: string
          last_alert_at: string | null
          min_calls_for_alert: number
          notify_email: string[] | null
          notify_phone: string[] | null
          updated_at: string
          webhook_name: string
        }
        Insert: {
          check_window_minutes?: number
          created_at?: string
          enabled?: boolean
          failure_threshold_percent?: number
          id?: string
          last_alert_at?: string | null
          min_calls_for_alert?: number
          notify_email?: string[] | null
          notify_phone?: string[] | null
          updated_at?: string
          webhook_name: string
        }
        Update: {
          check_window_minutes?: number
          created_at?: string
          enabled?: boolean
          failure_threshold_percent?: number
          id?: string
          last_alert_at?: string | null
          min_calls_for_alert?: number
          notify_email?: string[] | null
          notify_phone?: string[] | null
          updated_at?: string
          webhook_name?: string
        }
        Relationships: []
      }
      webhook_health_logs: {
        Row: {
          caller_phone: string | null
          created_at: string
          error_details: Json | null
          error_message: string | null
          id: string
          response_time_ms: number | null
          status: string
          twilio_call_sid: string | null
          webhook_name: string
        }
        Insert: {
          caller_phone?: string | null
          created_at?: string
          error_details?: Json | null
          error_message?: string | null
          id?: string
          response_time_ms?: number | null
          status: string
          twilio_call_sid?: string | null
          webhook_name: string
        }
        Update: {
          caller_phone?: string | null
          created_at?: string
          error_details?: Json | null
          error_message?: string | null
          id?: string
          response_time_ms?: number | null
          status?: string
          twilio_call_sid?: string | null
          webhook_name?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      get_all_profiles_with_audit: {
        Args: { context?: string }
        Returns: {
          company_id: string
          created_at: string
          email: string
          full_name: string
          id: string
          office_id: string
          phone: string
          updated_at: string
        }[]
      }
      get_user_role: {
        Args: { _user_id: string }
        Returns: Database["public"]["Enums"]["app_role"]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      ack_type:
        | "received"
        | "called_patient"
        | "advised_er"
        | "resolved"
        | "handed_off"
      app_role: "admin" | "manager" | "provider" | "operator"
      escalation_event_type:
        | "initiated"
        | "notified_tier1"
        | "notified_tier1_reminder"
        | "escalated_tier2"
        | "escalated_tier3"
        | "acknowledged"
        | "resolved"
        | "canceled"
        | "callback_initiated"
        | "callback_completed"
        | "callback_failed"
        | "summary_sent"
        | "provider_sms_reply"
        | "callback_provider_dialing"
        | "callback_provider_answered"
        | "callback_patient_dialing"
        | "callback_connected"
        | "callback_canceled"
      evidence_type:
        | "audit_logs"
        | "access_review"
        | "policy_attestations"
        | "escalation_sla_report"
      review_item_status: "retain" | "revoke" | "modify"
      review_status: "draft" | "published"
      sla_status: "met" | "warn" | "breached"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      ack_type: [
        "received",
        "called_patient",
        "advised_er",
        "resolved",
        "handed_off",
      ],
      app_role: ["admin", "manager", "provider", "operator"],
      escalation_event_type: [
        "initiated",
        "notified_tier1",
        "notified_tier1_reminder",
        "escalated_tier2",
        "escalated_tier3",
        "acknowledged",
        "resolved",
        "canceled",
        "callback_initiated",
        "callback_completed",
        "callback_failed",
        "summary_sent",
        "provider_sms_reply",
        "callback_provider_dialing",
        "callback_provider_answered",
        "callback_patient_dialing",
        "callback_connected",
        "callback_canceled",
      ],
      evidence_type: [
        "audit_logs",
        "access_review",
        "policy_attestations",
        "escalation_sla_report",
      ],
      review_item_status: ["retain", "revoke", "modify"],
      review_status: ["draft", "published"],
      sla_status: ["met", "warn", "breached"],
    },
  },
} as const
