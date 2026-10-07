export interface AudienceUpload {
  id: number;
  audience_id: number;
  created_at: string;
  status: string;
  file_name: string | null;
  file_size: number | null;
  total_contacts: number;
  processed_contacts: number;
  processed_at: string | null;
  error_message: string | null;
}
