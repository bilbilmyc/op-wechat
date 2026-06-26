-- CreateTable
CREATE TABLE "admins" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'admin',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "admins_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wechat_apps" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "app_id" TEXT NOT NULL,
    "app_secret_enc" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "encoding_aes_key" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "avatar_url" TEXT,
    "qr_url" TEXT,
    "access_token" TEXT,
    "token_expires_at" TIMESTAMP(3),
    "broadcast_rate_per_min" INTEGER NOT NULL DEFAULT 50,
    "disabled" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "wechat_apps_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fans" (
    "id" UUID NOT NULL,
    "wechat_app_id" UUID NOT NULL,
    "openid" TEXT NOT NULL,
    "unionid" TEXT,
    "nickname" TEXT,
    "avatar_url" TEXT,
    "subscribe_status" TEXT NOT NULL DEFAULT 'subscribed',
    "subscribed_at" TIMESTAMP(3),
    "unsubscribed_at" TIMESTAMP(3),
    "remark" TEXT,
    "last_active_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "fans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fan_tags" (
    "id" UUID NOT NULL,
    "wechat_app_id" UUID NOT NULL,
    "wechat_tag_id" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fan_tags_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fan_tag_assignments" (
    "fan_id" UUID NOT NULL,
    "tag_id" UUID NOT NULL,
    "assigned_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fan_tag_assignments_pkey" PRIMARY KEY ("fan_id","tag_id")
);

-- CreateTable
CREATE TABLE "messages" (
    "id" UUID NOT NULL,
    "wechat_app_id" UUID NOT NULL,
    "fan_id" UUID NOT NULL,
    "direction" TEXT NOT NULL,
    "msg_type" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "media_id" TEXT,
    "wechat_msg_id" TEXT,
    "status" TEXT NOT NULL DEFAULT 'received',
    "agent_id" UUID,
    "error_msg" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "conversations" (
    "id" UUID NOT NULL,
    "wechat_app_id" UUID NOT NULL,
    "fan_id" UUID NOT NULL,
    "last_message_at" TIMESTAMP(3),
    "last_message_preview" TEXT,
    "unread_count" INTEGER NOT NULL DEFAULT 0,
    "assigned_agent_id" UUID,
    "status" TEXT NOT NULL DEFAULT 'open',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "conversations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "broadcasts" (
    "id" UUID NOT NULL,
    "wechat_app_id" UUID NOT NULL,
    "created_by" UUID NOT NULL,
    "content_type" TEXT NOT NULL,
    "content_json" JSONB NOT NULL,
    "target_type" TEXT NOT NULL,
    "target_filter_json" JSONB,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "scheduled_at" TIMESTAMP(3),
    "sent_at" TIMESTAMP(3),
    "total_count" INTEGER NOT NULL DEFAULT 0,
    "success_count" INTEGER NOT NULL DEFAULT 0,
    "failed_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "broadcasts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "broadcast_targets" (
    "id" UUID NOT NULL,
    "broadcast_id" UUID NOT NULL,
    "fan_id" UUID NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "sent_at" TIMESTAMP(3),
    "error_msg" TEXT,

    CONSTRAINT "broadcast_targets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rules" (
    "id" UUID NOT NULL,
    "wechat_app_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "trigger_type" TEXT NOT NULL,
    "trigger_config_json" JSONB NOT NULL,
    "action_type" TEXT NOT NULL,
    "action_config_json" JSONB NOT NULL,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "stop_propagation" BOOLEAN NOT NULL DEFAULT false,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rule_executions" (
    "id" UUID NOT NULL,
    "rule_id" UUID NOT NULL,
    "fan_id" UUID NOT NULL,
    "triggered_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "message_id" UUID,
    "action_taken" TEXT,
    "success" BOOLEAN NOT NULL DEFAULT false,
    "error_msg" TEXT,

    CONSTRAINT "rule_executions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "admins_email_key" ON "admins"("email");

-- CreateIndex
CREATE UNIQUE INDEX "wechat_apps_app_id_key" ON "wechat_apps"("app_id");

-- CreateIndex
CREATE INDEX "fans_unionid_idx" ON "fans"("unionid");

-- CreateIndex
CREATE UNIQUE INDEX "fans_wechat_app_id_openid_key" ON "fans"("wechat_app_id", "openid");

-- CreateIndex
CREATE UNIQUE INDEX "fan_tags_wechat_app_id_wechat_tag_id_key" ON "fan_tags"("wechat_app_id", "wechat_tag_id");

-- CreateIndex
CREATE INDEX "messages_wechat_app_id_fan_id_created_at_idx" ON "messages"("wechat_app_id", "fan_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "messages_wechat_app_id_created_at_idx" ON "messages"("wechat_app_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "conversations_wechat_app_id_last_message_at_idx" ON "conversations"("wechat_app_id", "last_message_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "conversations_fan_id_key" ON "conversations"("fan_id");

-- CreateIndex
CREATE UNIQUE INDEX "conversations_wechat_app_id_fan_id_key" ON "conversations"("wechat_app_id", "fan_id");

-- CreateIndex
CREATE INDEX "broadcast_targets_broadcast_id_status_idx" ON "broadcast_targets"("broadcast_id", "status");

-- CreateIndex
CREATE INDEX "rules_wechat_app_id_enabled_priority_idx" ON "rules"("wechat_app_id", "enabled", "priority" DESC);

-- CreateIndex
CREATE INDEX "rule_executions_rule_id_triggered_at_idx" ON "rule_executions"("rule_id", "triggered_at" DESC);

-- AddForeignKey
ALTER TABLE "fans" ADD CONSTRAINT "fans_wechat_app_id_fkey" FOREIGN KEY ("wechat_app_id") REFERENCES "wechat_apps"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fan_tags" ADD CONSTRAINT "fan_tags_wechat_app_id_fkey" FOREIGN KEY ("wechat_app_id") REFERENCES "wechat_apps"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fan_tag_assignments" ADD CONSTRAINT "fan_tag_assignments_fan_id_fkey" FOREIGN KEY ("fan_id") REFERENCES "fans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fan_tag_assignments" ADD CONSTRAINT "fan_tag_assignments_tag_id_fkey" FOREIGN KEY ("tag_id") REFERENCES "fan_tags"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_wechat_app_id_fkey" FOREIGN KEY ("wechat_app_id") REFERENCES "wechat_apps"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_fan_id_fkey" FOREIGN KEY ("fan_id") REFERENCES "fans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "admins"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_wechat_app_id_fkey" FOREIGN KEY ("wechat_app_id") REFERENCES "wechat_apps"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_fan_id_fkey" FOREIGN KEY ("fan_id") REFERENCES "fans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_assigned_agent_id_fkey" FOREIGN KEY ("assigned_agent_id") REFERENCES "admins"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "broadcasts" ADD CONSTRAINT "broadcasts_wechat_app_id_fkey" FOREIGN KEY ("wechat_app_id") REFERENCES "wechat_apps"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "broadcasts" ADD CONSTRAINT "broadcasts_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "admins"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "broadcast_targets" ADD CONSTRAINT "broadcast_targets_broadcast_id_fkey" FOREIGN KEY ("broadcast_id") REFERENCES "broadcasts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rules" ADD CONSTRAINT "rules_wechat_app_id_fkey" FOREIGN KEY ("wechat_app_id") REFERENCES "wechat_apps"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rule_executions" ADD CONSTRAINT "rule_executions_rule_id_fkey" FOREIGN KEY ("rule_id") REFERENCES "rules"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rule_executions" ADD CONSTRAINT "rule_executions_fan_id_fkey" FOREIGN KEY ("fan_id") REFERENCES "fans"("id") ON DELETE CASCADE ON UPDATE CASCADE;
