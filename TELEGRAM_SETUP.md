# Jelly Job Bot Telegram provisioning
#
# Do not put the token in this repository. When Jelly supplies the new
# BotFather token, write it to:
#   /home/hermes/.hermes/profiles/job-agent/.env
# with mode 0600 as TELEGRAM_BOT_TOKEN.
#
# Lock access to Jelly's Telegram numeric user ID:
#   TELEGRAM_ALLOWED_USERS=7636141712
#   TELEGRAM_ALLOW_ALL_USERS=false
#   TELEGRAM_HOME_CHANNEL=7636141712
#
# Verify the unique token with Telegram getMe, then install/start only:
#   yes y | job-agent gateway install --force
#   job-agent gateway start
#   job-agent gateway status
#
# Expected systemd unit: hermes-gateway-job-agent.service
# Never reuse a token from an existing Hermes gateway.
