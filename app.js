const express = require("express");
const cors = require("cors");
const { sendWhatsappMessage } = require("./twilio");
const { getCompletion } = require("./openai");
const { registerExpense, fetchSummary, storeLastMsg, getLastMsg, deleteExpense } = require("./redis.js");

require("dotenv").config();

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.post("/chat/receive", async (req, res) => {
  const { Body: body, From: from } = req.body;

  try {
    const gptResponse = await getCompletion(body);
    const parsedResponse = JSON.parse(gptResponse);
    console.log(parsedResponse);

    if (gptResponse) {
      switch (parsedResponse.acao) {
        case "register_expense":
          await registerExpense(from, parsedResponse);
          await sendWhatsappMessage(from, parsedResponse.message);
          break;
        case "fetch_summary":
          const fetchMessage = await fetchSummary(from, parsedResponse.periodo);
          await sendWhatsappMessage(from, fetchMessage.message);
          break;
        case "delete_request":
          await storeLastMsg(from, parsedResponse);
          await sendWhatsappMessage(from, parsedResponse.message);
          break;
        case "delete_confirm":
          const lastRequest = await getLastMsg(from);
          if (lastRequest) {
            await deleteExpense(from, lastRequest);
            await sendWhatsappMessage(from, parsedResponse.message);
          } else {
            await sendWhatsappMessage(
              from,
              "Nenhuma solicitação de exclusão encontrada."
            );
          }
          break;
        default:
          await sendWhatsappMessage(from, parsedResponse.message);
          break;
      }
    } else {
      await sendWhatsappMessage(
        from,
        "Não foi possível realizar nenhuma açao, tente novamente!"
      );
    }

    res
      .status(200)
      .json({
        success: "Mensagem processada com sucesso!",
        resposta: parsedResponse,
      });
  } catch (error) {
    res
      .status(500)
      .json({ error: "Erro ao processar mensagem.", details: error.message });
  }
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`🚀 Servidor rodando na porta ${PORT}`);
});
