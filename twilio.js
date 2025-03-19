const { Twilio } = require("twilio");
require("dotenv").config();

const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const twilioWpp = process.env.TWILIO_WHATSAPP_NUMBER;

const twilio = new Twilio(accountSid, authToken);

async function sendWhatsappMessage(to, body) {
  try {
    console.log(`📤 Enviando Mensagem..`);
    console.log(`📤 to: ${to}`);
    console.log(`📤 body: ${body}`);
    const message = await twilio.messages.create({
      body: body,
      from: twilioWpp,
      to: to,
    });
    console.log(`📤 Mensagem Enviada com Sucesso!`);
    console.log(`📤 id: ${message.sid}`);    
  } catch (error) {
    console.error("❌ Erro ao enviar mensagem:", error);
    throw error;
  }
}

module.exports = { sendWhatsappMessage };