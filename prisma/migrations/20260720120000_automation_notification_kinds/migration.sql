-- Automations VS5 / B13 - additive notification kinds for skip + approval expiry.
ALTER TYPE "NotificationKind" ADD VALUE IF NOT EXISTS 'automation_no_new_post';
ALTER TYPE "NotificationKind" ADD VALUE IF NOT EXISTS 'automation_approval_expired';
