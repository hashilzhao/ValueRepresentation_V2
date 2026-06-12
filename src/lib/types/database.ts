/** Database row types for the Study 1 experiment system. */

export type ParticipantStatus = "active" | "completed" | "excluded";

export interface Participant {
  id: string;
  participant_code: string;
  age: number;
  gender: string;
  major: string;
  consented: boolean;
  consent_timestamp: string;
  status: ParticipantStatus;
  created_at: string;
}

export type SessionStatus = "in_progress" | "completed" | "excluded";

export interface ExperimentSession {
  id: string;
  participant_id: string;
  group_label: "scarcity" | "abundance";
  current_stage: string;
  status: SessionStatus;
  started_at: string;
  completed_at: string | null;
  created_at: string;
}

export interface EventLog {
  id: number;
  session_id: string;
  participant_id: string;
  event_type: string;
  event_data: Record<string, unknown> | null;
  created_at: string;
}
