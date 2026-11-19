'use strict';
// Los permisos que ZenChat pide a Twitch (los usan el PC y el móvil)
(function (g) {
  const SCOPES = ["chat:read", "chat:edit", "user:read:chat", "user:write:chat", "user:read:emotes", "moderator:read:followers", "channel:read:subscriptions", "bits:read", "channel:read:redemptions", "channel:manage:redemptions", "channel:read:hype_train", "channel:read:polls", "channel:manage:polls", "channel:read:predictions", "channel:manage:predictions", "channel:read:ads", "channel:edit:commercial", "channel:read:charity", "channel:read:goals", "moderator:read:shoutouts", "moderator:manage:shoutouts", "moderator:manage:banned_users", "moderator:manage:chat_messages", "moderator:manage:chat_settings", "moderator:manage:announcements", "moderator:read:chatters", "moderator:manage:warnings", "moderator:read:vips", "moderator:read:moderators", "channel:manage:moderators", "channel:manage:vips", "channel:manage:raids", "channel:manage:broadcast", "channel:read:vips", "channel:moderate", "user:read:blocked_users", "user:manage:blocked_users", "user:read:follows", "moderator:read:unban_requests", "moderator:manage:unban_requests", "clips:edit", "editor:manage:clips", "channel:manage:clips"];
  if (typeof module !== 'undefined') module.exports = SCOPES;
  g.ZEN_SCOPES = SCOPES;
})(typeof window !== 'undefined' ? window : globalThis);
