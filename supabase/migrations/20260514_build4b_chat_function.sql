-- =====================================================================
-- ScienceKit — Build 4 Half B: chat token-usage RPC
-- Atomic INSERT-or-INCREMENT for daily_token_usage.
-- Called from the chat edge function with the service role key.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.increment_token_usage(
  p_teacher_id uuid,
  p_day        date,
  p_input      int,
  p_output     int
) RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  INSERT INTO public.daily_token_usage AS u (teacher_id, day, input_tokens, output_tokens, request_count)
  VALUES (p_teacher_id, p_day, p_input, p_output, 1)
  ON CONFLICT (teacher_id, day) DO UPDATE
  SET input_tokens  = u.input_tokens  + EXCLUDED.input_tokens,
      output_tokens = u.output_tokens + EXCLUDED.output_tokens,
      request_count = u.request_count + 1,
      updated_at    = now();
END;
$$;
