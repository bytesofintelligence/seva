ALTER TABLE profiles ADD COLUMN IF NOT EXISTS phone text;

-- Two users. Vera = volunteer (verified). Cara = charity coordinator (verified).
-- Ursula = volunteer with an UNVERIFIED email.
INSERT INTO auth.users (id, email, email_confirmed_at, raw_user_meta_data) VALUES
 ('11111111-1111-1111-1111-111111111111','vera@example.com',   NOW(), '{"role":"volunteer","full_name":"Vera"}'),
 ('22222222-2222-2222-2222-222222222222','cara@example.com',   NOW(), '{"role":"charity","full_name":"Cara"}'),
 ('33333333-3333-3333-3333-333333333333','ursula@example.com', NULL,  '{"role":"volunteer","full_name":"Ursula"}');

-- A user who tried to claim an unknown role at signup.
INSERT INTO auth.users (id, email, email_confirmed_at, raw_user_meta_data) VALUES
 ('44444444-4444-4444-4444-444444444444','eve@example.com', NOW(), '{"role":"admin","full_name":"Eve"}');

-- Since 027, "role":"charity" in signup metadata no longer grants the role --
-- it files a request for approval. Cara is a coordinator because an admin
-- approved her request, which is now the only way to become one.
SELECT admin_approve_charity_access(
  (SELECT id FROM charity_access_requests WHERE user_id = '22222222-2222-2222-2222-222222222222'),
  'seed fixture: pre-approved coordinator');

INSERT INTO charities (id, owner_id, name) VALUES
 ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','22222222-2222-2222-2222-222222222222','Cara Foodbank');

-- A recurring series owned by Cara's charity, for the generate_series_occurrences
-- authorization tests.
INSERT INTO opportunity_series
  (id, charity_id, title, recurrence_type, recurrence_day_of_week, template_time, template)
VALUES
 ('dddddddd-dddd-dddd-dddd-dddddddddddd','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  'Weekly sorting','weekly',6,'18:30',
  '{"title":"Weekly sorting","description":"d","location":"l","type":"sorting","target_volunteers":5,"max_volunteers":10,"signup_mode":"review"}');
