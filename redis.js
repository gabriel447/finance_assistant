require("dotenv").config();

// Descomente para uso em desenvolvimento
const Redis = require("ioredis");
const redis = new Redis({
  host: process.env.REDIS_HOST,
  port: process.env.REDIS_PORT,
  enableReadyCheck: false,
});

async function registerExpense(to, expense) {
  console.log(expense);
  if (!to || !expense.categoria || !expense.valor || !expense.tipo || !expense.description) {
    throw new Error("Dados incompletos.");
  }

  if (expense.valor <= 0) {
    throw new Error("O valor do gasto deve ser maior que zero.");
  }

  const userNumber = to.replace("whatsapp:+", "");
  const expenseKey = `expenses:${userNumber}`;
  const expenseData = {
    id: userNumber,
    description: expense.description,
    categoria: expense.categoria,
    valor: expense.valor,
    tipo: expense.tipo,
    data: new Date().toISOString(),
  };

  try {
    await redis.lpush(expenseKey, JSON.stringify(expenseData));
    console.log(`💰 Gasto registrado para ${userNumber}`);
  } catch (error) {
    console.error("Erro ao registrar gasto:", error);
    throw error;
  }
}

async function fetchSummary(to, periodo) {
  if (!to || !periodo) {
    throw new Error("Dados incompletos.");
  }

  const userNumber = to.replace("whatsapp:+", "");
  const expenseKey = `expenses:${userNumber}`;
  const now = new Date();
  let startDate;

  switch (periodo) {
    case "dia":
      startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      break;
    case "semana":
      startDate = new Date(now);
      startDate.setDate(startDate.getDate() - 7);
      break;
    case "mês":
      startDate = new Date(now);
      startDate.setDate(startDate.getDate() - 30);
      break;
    default:
      throw new Error("Período inválido.");
  }

  try {
    const expenses = await redis.lrange(expenseKey, 0, -1);

    const filteredExpenses = expenses
      .map((exp) => {
        try {
          const parsed = JSON.parse(exp);
          parsed.valor = Number(parsed.valor) || 0;
          parsed.data = new Date(parsed.data);
          return parsed;
        } catch (e) {
          console.error("Erro ao parsear gasto:", exp, e);
          return null;
        }
      })
      .filter((exp) => exp && exp.data >= startDate);

    if (filteredExpenses.length === 0) {
      return {
        message: `Nenhum gasto encontrado.`,
      };
    }

    const total = filteredExpenses.reduce((acc, exp) => {
      const valor = Number(exp.valor);
      return isNaN(valor) ? acc : acc + valor;
    }, 0);

    const categoryTotals = {};
    filteredExpenses.forEach((exp) => {
      if (!categoryTotals[exp.categoria]) {
        categoryTotals[exp.categoria] = 0;
      }
      categoryTotals[exp.categoria] += Number(exp.valor);
    });

    const topCategory = Object.entries(categoryTotals).reduce(
      (max, current) => (current[1] > max[1] ? current : max),
      ["Nenhuma", 0]
    );

    let expenseList = filteredExpenses
      .map((exp) => {
        const dataFormatada = exp.data.toLocaleString("pt-BR", {
          day: "2-digit",
          month: "2-digit",
          year: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        });

        return `*Categoria:* ${exp.categoria}\n*Valor:* R$${Number(exp.valor).toFixed(2)}\n*Data:* ${dataFormatada}\n*Descrição:* ${exp.description || "Sem descrição"}\n*Pagamento:* ${exp.tipo}\n`;
      })
      .join("\n");

    let summaryMessage =
      `💰 *Resumo dos seus gastos do ${periodo}*\n` +
      `Total: *R$${total.toFixed(2)}*\n\n` +
      `📊 *Detalhes dos gastos:*\n${expenseList}\n` +
      `🔥 *Categoria mais gasta:* ${topCategory[0]} R$${topCategory[1].toFixed(2)}`;

    return { message: summaryMessage };
  } catch (error) {
    console.error("Erro ao buscar resumo:", error);
    throw error;
  }
}

async function storeLastMsg(to, last) {
  const key = `last_request:${to}`;
  const dataToStore = {
    acao: last.acao,
    periodo: last.periodo,
  };
  await redis.set(key, JSON.stringify(dataToStore), "EX", 300);
}

async function getLastMsg(to) {
  const key = `last_request:${to}`;
  const data = await redis.get(key);
  return JSON.parse(data) ?? null;
}

async function deleteExpense(to, lastRequest) {
  if (!to || !lastRequest.periodo) {
    throw new Error("Dados incompletos.");
  }

  const userNumber = to.replace("whatsapp:+", "");
  const expenseKey = `expenses:${userNumber}`;
  const now = new Date();
  let startDate;

  switch (lastRequest.periodo) {
    case "último":
      try {
        const lastExpense = await redis.lpop(expenseKey);
        if (!lastExpense) {
          return { message: "Nenhum gasto encontrado para remoção." };
        }

        await redis.del(`last_request:${to}`);

        return {
          message: "O último gasto foi removido com sucesso.",
          acao: "clear_expense",
          periodo: "último",
        };
      } catch (error) {
        console.error("Erro ao remover último gasto:", error);
        throw error;
      }

    case "hoje":
      startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      break;
    case "semana":
      startDate = new Date(now);
      startDate.setDate(startDate.getDate() - 7);
      break;
    case "mês":
      startDate = new Date(now.getFullYear(), now.getMonth(), 1);
      break;
    default:
      throw new Error("Período inválido.");
  }

  try {
    const expenses = await redis.lrange(expenseKey, 0, -1);
    const parsedExpenses = expenses.map((exp) => JSON.parse(exp));

    const filteredExpenses = parsedExpenses.filter(
      (exp) => new Date(exp.data) >= startDate
    );

    if (filteredExpenses.length === 0) {
      return {
        message: `Nenhum gasto encontrado para o período de ${lastRequest.periodo}.`,
      };
    }

    const remainingExpenses = parsedExpenses.filter(
      (exp) => new Date(exp.data) < startDate
    );

    await redis.del(expenseKey);
    if (remainingExpenses.length > 0) {
      await redis.rpush(
        expenseKey,
        ...remainingExpenses.map((exp) => JSON.stringify(exp))
      );
    }

    return {
      message: `Os gastos do período ${lastRequest.periodo} foram removidos com sucesso.`,
      acao: "clear_expense",
      periodo: lastRequest.periodo,
    };
  } catch (error) {
    console.error("Erro ao limpar gastos:", error);
    throw error;
  }
}

module.exports = { registerExpense, fetchSummary, storeLastMsg, getLastMsg, deleteExpense };
