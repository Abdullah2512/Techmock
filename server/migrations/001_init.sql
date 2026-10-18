-- TechMock AI initial schema (PostgreSQL / Neon). gen_random_uuid() is built in since PG 13.

CREATE TABLE users (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name          text        NOT NULL CHECK (char_length(name) BETWEEN 1 AND 80),
  email         text        NOT NULL CHECK (email = lower(email) AND char_length(email) <= 254),
  password_hash text        NOT NULL,
  role          text        NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'admin')),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT users_email_key UNIQUE (email)
);

CREATE TABLE user_preferences (
  user_id            uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  theme              text        NOT NULL DEFAULT 'dark' CHECK (theme IN ('dark', 'light')),
  preferred_language text        NOT NULL DEFAULT 'javascript',
  updated_at         timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE refresh_tokens (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash  text        NOT NULL UNIQUE,
  expires_at  timestamptz NOT NULL,
  revoked_at  timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX refresh_tokens_user_idx ON refresh_tokens (user_id);

CREATE TABLE interview_sessions (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          uuid        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  topic            text        NOT NULL CHECK (topic IN ('dsa','javascript','react','nodejs','python','sql','system-design')),
  difficulty       text        NOT NULL CHECK (difficulty IN ('beginner','intermediate','advanced')),
  mode             text        NOT NULL CHECK (mode IN ('coding','qa')),
  duration_minutes integer     NOT NULL CHECK (duration_minutes BETWEEN 5 AND 120),
  status           text        NOT NULL DEFAULT 'created'
                   CHECK (status IN ('created','in_progress','submitted','completed','cancelled')),
  data_source      text        NOT NULL DEFAULT 'live' CHECK (data_source IN ('live','demo')),
  started_at       timestamptz,
  completed_at     timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX interview_sessions_user_created_idx ON interview_sessions (user_id, created_at DESC);
CREATE INDEX interview_sessions_user_status_idx  ON interview_sessions (user_id, status);

CREATE TABLE interview_questions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id      uuid        NOT NULL REFERENCES interview_sessions(id) ON DELETE CASCADE,
  sequence_number integer     NOT NULL CHECK (sequence_number >= 1),
  question_type   text        NOT NULL CHECK (question_type IN ('primary','follow_up')),
  prompt          text        NOT NULL,
  metadata        jsonb       NOT NULL DEFAULT '{}'::jsonb,
  created_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT interview_questions_seq_key UNIQUE (session_id, sequence_number)
);

CREATE TABLE interview_answers (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id         uuid        NOT NULL REFERENCES interview_sessions(id) ON DELETE CASCADE,
  question_id        uuid        NOT NULL REFERENCES interview_questions(id) ON DELETE CASCADE,
  answer_text        text,
  source_code        text,
  language           text,
  execution_metadata jsonb       NOT NULL DEFAULT '{}'::jsonb,
  submitted_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT interview_answers_question_key UNIQUE (question_id)
);
CREATE INDEX interview_answers_session_idx ON interview_answers (session_id);

-- Server-recorded code executions. Evaluation uses these rows as execution evidence,
-- never client-supplied claims about test results.
CREATE TABLE code_runs (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id  uuid        NOT NULL REFERENCES interview_sessions(id) ON DELETE CASCADE,
  question_id uuid        NOT NULL REFERENCES interview_questions(id) ON DELETE CASCADE,
  language    text        NOT NULL,
  code_sha256 text        NOT NULL,
  result      jsonb       NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX code_runs_session_idx ON code_runs (session_id, created_at DESC);

CREATE TABLE evaluation_reports (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id      uuid        NOT NULL UNIQUE REFERENCES interview_sessions(id) ON DELETE CASCADE,
  total_score     integer     NOT NULL CHECK (total_score BETWEEN 0 AND 100),
  category_scores jsonb       NOT NULL,
  strengths       jsonb       NOT NULL DEFAULT '[]'::jsonb,
  weaknesses      jsonb       NOT NULL DEFAULT '[]'::jsonb,
  suggestions     jsonb       NOT NULL DEFAULT '[]'::jsonb,
  summary         text        NOT NULL,
  details         jsonb       NOT NULL DEFAULT '{}'::jsonb,
  is_demo         boolean     NOT NULL DEFAULT false,
  created_at      timestamptz NOT NULL DEFAULT now()
);
