import { expect, test } from "@playwright/test"

test("/matricula apresenta a escolha antes do cadastro", async ({ page }) => {
  await page.goto("/matricula")

  await expect(
    page.getByRole("heading", { name: "Escolha como deseja se matricular" }),
  ).toBeVisible()
  await expect(page.getByRole("link", { name: /Mensalista/ })).toHaveAttribute(
    "href",
    "/matricula?tipoPagamento=mensalista",
  )
  await expect(page.getByRole("link", { name: /Wellhub/ })).toHaveAttribute(
    "href",
    "/matricula?tipoPagamento=wellhub",
  )
  await expect(page.getByRole("link", { name: /TotalPass/ })).toHaveAttribute(
    "href",
    "/matricula?tipoPagamento=totalpass",
  )
  await expect(page.getByLabel("Nome completo")).toHaveCount(0)
})

test("atalho mensalista mantém o pagamento PIX", async ({ page }) => {
  await page.goto("/matricula?tipoPagamento=mensalista")

  await expect(page.getByRole("heading", { name: "Matrícula mensalista" })).toBeVisible()
  await expect(page.getByText("Primeira mensalidade", { exact: true })).toBeVisible()
  await expect(page.getByText("Selecionar comprovante")).toBeVisible()
  await expect(page.getByRole("button", { name: "Continuar para o pagamento PIX" })).toBeVisible()
  await expect(page.getByText(/Declaro ter o Wellhub/)).toHaveCount(0)
  await expect(page.getByText(/Declaro ter o TotalPass/)).toHaveCount(0)
})

test("atalho Wellhub exige Basic e não exibe cobrança", async ({ page }) => {
  await page.goto("/matricula?tipoPagamento=wellhub")

  await expect(page.getByRole("heading", { name: "Matrícula Wellhub" })).toBeVisible()
  await expect(
    page.getByRole("checkbox", {
      name: "Declaro ter o Wellhub ativo a partir do plano Basic.",
    }),
  ).toBeVisible()
  await expect(page.getByText("Primeira mensalidade", { exact: true })).toHaveCount(0)
  await expect(page.getByText("Selecionar comprovante")).toHaveCount(0)
  await expect(page.getByRole("button", { name: "Enviar matrícula Wellhub" })).toBeVisible()
})

test("atalho TotalPass exige TP1+ e não exibe cobrança", async ({ page }) => {
  await page.goto("/matricula?tipoPagamento=totalpass")

  await expect(page.getByRole("heading", { name: "Matrícula TotalPass" })).toBeVisible()
  await expect(
    page.getByRole("checkbox", {
      name: "Declaro ter o TotalPass ativo a partir do plano TP1+.",
    }),
  ).toBeVisible()
  await expect(page.getByText("Primeira mensalidade", { exact: true })).toHaveCount(0)
  await expect(page.getByText("Selecionar comprovante")).toHaveCount(0)
  await expect(page.getByRole("button", { name: "Enviar matrícula TotalPass" })).toBeVisible()
})

test("parâmetro inválido ou repetido volta para a pré-tela", async ({ page }) => {
  for (const url of [
    "/matricula?tipoPagamento=avulso",
    "/matricula?tipoPagamento=wellhub&tipoPagamento=totalpass",
  ]) {
    await page.goto(url)
    await expect(
      page.getByRole("heading", { name: "Escolha como deseja se matricular" }),
    ).toBeVisible()
  }
})
