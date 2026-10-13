-- 002b (B4): pg_net is not relocatable; its functions live in schema `net`, not `extensions`.
create or replace function private.dispatch_kick()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_url text; v_key text;
begin
  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'public_functions_url';
  select decrypted_secret into v_key from vault.decrypted_secrets where name = 'supabase_secret_key';
  if v_url is null or v_key is null then
    update public.dispatches set status = 'failed', error = jsonb_build_object('reason', 'vault secrets missing') where id = new.id;
    return new;
  end if;
  perform net.http_post(
    url := v_url || '/dispatch',
    body := jsonb_build_object('dispatch_id', new.id),
    headers := jsonb_build_object('Content-Type', 'application/json', 'apikey', v_key),
    timeout_milliseconds := 20000);
  return new;
end $$;
