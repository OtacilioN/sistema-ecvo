import { expect, test } from "@playwright/test"

test("matrícula oferece plano família com um único PIX para 2 a 4 pessoas", async ({ page }) => {
  await page.goto("/matricula")
  const opcaoFamilia = page.getByRole("link", { name: /plano família/i })
  await expect(opcaoFamilia).toHaveAttribute("href", "/matricula?tipoPagamento=familia")
  await opcaoFamilia.click()

  const quantidade = page.getByLabel("Quantidade de pessoas")
  const resumo = page.getByTestId("plano-matricula-familia")
  await expect(quantidade).toHaveValue("2")
  await expect(quantidade.locator("option")).toHaveText(["2 pessoas", "3 pessoas", "4 pessoas"])
  await expect(resumo).toContainText("R$ 90,00 por pessoa / mês")
  await expect(resumo).toContainText("um único PIX de R$ 180,00")
  await expect(page.getByTestId("pessoa-familia-1")).toBeVisible()
  await expect(page.getByTestId("pessoa-familia-2")).toBeVisible()
  await expect(page.getByTestId("pessoa-familia-3")).toBeHidden()

  await quantidade.selectOption("3")
  await expect(resumo).toContainText("um único PIX de R$ 270,00")
  await expect(page.getByTestId("pessoa-familia-3")).toBeVisible()
  await expect(page.getByTestId("pessoa-familia-4")).toBeHidden()

  await quantidade.selectOption("4")
  await expect(resumo).toContainText("um único PIX de R$ 360,00")
  await expect(page.getByTestId("pessoa-familia-4")).toBeVisible()
})

test("cada pessoa mantém seus dados e modalidade ao alterar a quantidade", async ({ page }) => {
  await page.goto("/matricula?tipoPagamento=familia")
  const quantidade = page.getByLabel("Quantidade de pessoas")
  const primeira = page.getByTestId("pessoa-familia-1")
  const segunda = page.getByTestId("pessoa-familia-2")
  const terceira = page.getByTestId("pessoa-familia-3")
  const botao = page.getByRole("button", { name: /Continuar para o PIX/ })

  await expect(botao).toBeDisabled()
  await primeira.getByLabel("Nome completo").fill("Pessoa um")
  await segunda.getByLabel("Nome completo").fill("Pessoa dois")
  const primeiraModalidade = primeira.getByLabel("Modalidade", { exact: false })
  const segundaModalidade = segunda.getByLabel("Modalidade", { exact: false })
  await primeiraModalidade.selectOption({ index: 1 })
  await expect(segundaModalidade).toHaveValue("")
  await expect(botao).toBeDisabled()
  await segundaModalidade.selectOption({ index: 1 })
  await expect(botao).toBeEnabled()

  await quantidade.selectOption("3")
  await expect(botao).toBeDisabled()
  await terceira.getByLabel("Nome completo").fill("Pessoa três")
  await terceira.getByLabel("Modalidade", { exact: false }).selectOption({ index: 1 })
  await expect(botao).toBeEnabled()

  await quantidade.selectOption("2")
  await expect(terceira).toBeHidden()
  await expect(terceira.getByLabel("Nome completo")).toBeDisabled()
  await expect(botao).toBeEnabled()
  const dadosFormulario = await botao.evaluate((elemento) => {
    const formulario = (elemento as HTMLButtonElement).form
    return formulario ? Object.fromEntries(new FormData(formulario)) : null
  })
  expect(dadosFormulario).toMatchObject({
    quantidadePessoas: "2",
    "pessoas.0.nome": "Pessoa um",
    "pessoas.1.nome": "Pessoa dois",
  })
  expect(dadosFormulario).not.toHaveProperty("pessoas.2.nome")
  expect(dadosFormulario).not.toHaveProperty("pessoas.3.nome")
  await quantidade.selectOption("3")
  await expect(primeira.getByLabel("Nome completo")).toHaveValue("Pessoa um")
  await expect(segunda.getByLabel("Nome completo")).toHaveValue("Pessoa dois")
  await expect(terceira.getByLabel("Nome completo")).toHaveValue("Pessoa três")
  await expect(botao).toBeEnabled()
})
