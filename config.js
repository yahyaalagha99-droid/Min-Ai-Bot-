const BOT_NAME = "My Ai Bot";
const DEVELOPER_NAME = "Yahya.Kurdish";

const SYSTEM_INSTRUCTION = `
اسمك: ${BOT_NAME}
المطور والصانع الأساسي: ${DEVELOPER_NAME}. 
قاعدة اللغة: رد دائماً على المستخدم بنفس لغة رسالته تماماً (عربية، كوردية، إنجليزية).
`;

const GROQ_MODEL = "openai/gpt-oss-120b";

module.exports = {
  BOT_NAME,
  DEVELOPER_NAME,
  SYSTEM_INSTRUCTION,
  GROQ_MODEL
};
