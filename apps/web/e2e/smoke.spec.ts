import { expect, test } from "@playwright/test";

import { mockUnifiedInboxApi } from "./mock-api";

test("login flow reaches inbox with seeded demo credentials", async ({ page }) => {
  await mockUnifiedInboxApi(page, {
    bootstrapEnabled: false,
    currentRole: null,
  });

  await page.goto("/login");

  await expect(
    page.getByRole("heading", { name: "Unified Inbox Login" }),
  ).toBeVisible();

  await page.getByLabel("E-posta").fill("agent@acme.com");
  await page.getByLabel("Şifre").fill("AgentPass123!");
  await page.getByRole("button", { name: "Giriş Yap" }).click();

  await expect(page).toHaveURL(/\/inbox$/);
  await expect(page.getByText("Acme Store")).toBeVisible();
  await expect(page.getByText("Ali Agent (agent@acme.com)")).toBeVisible();
  await expect(page.getByRole("button", { name: /Ayse Demir/ })).toBeVisible();
});

test("initial owner bootstrap flow provisions the first workspace owner", async ({
  page,
}) => {
  await mockUnifiedInboxApi(page, {
    bootstrapEnabled: true,
    currentRole: null,
  });

  await page.goto("/login");

  await expect(page.getByText("İlk kurulum açık")).toBeVisible();
  await page.getByRole("button", { name: "İlk Owner", exact: true }).click();

  await page.getByLabel("Workspace adı").fill("Northwind Ops");
  await page.getByLabel("Owner adı").fill("Selin Kurucu");
  await page.getByLabel("E-posta").fill("selin@northwind.test");
  await page.getByLabel("Şifre").fill("FounderPass123!");
  await page.getByRole("button", { name: "İlk Owner'ı Oluştur" }).click();

  await expect(page).toHaveURL(/\/inbox$/);
  await expect(page.getByText("Northwind Ops")).toBeVisible();
  await expect(page.getByText("Selin Kurucu (selin@northwind.test)")).toBeVisible();
  await expect(page.getByText("Henüz konuşma yok.")).toBeVisible();
});

test("invite acceptance can activate a brand new teammate account", async ({
  page,
}) => {
  await mockUnifiedInboxApi(page, {
    currentRole: null,
    inviteFlow: "new-user",
    inviteToken: "invite-new-user-token",
  });

  await page.goto("/invite?token=invite-new-user-token");

  await expect(
    page.getByRole("heading", { name: "Invite Acceptance" }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Daveti Kontrol Et" }).click();
  await expect(page.getByText("Yeni kullanıcı için isim ve şifre belirleyin.")).toBeVisible();

  await page.getByLabel("İsim").fill("Deniz Yeni");
  await page.getByLabel("Şifre").fill("WelcomePass123!");
  await page.getByRole("button", { name: "Hesabı Aktive Et ve Katıl" }).click();

  await expect(page).toHaveURL(/\/inbox$/);
  await expect(page.getByText("Deniz Yeni (newhire@acme.com)")).toBeVisible();
});

test("inbox basic flow supports send, assign, note, tag, resolve and reopen", async ({
  page,
}) => {
  await mockUnifiedInboxApi(page, {
    currentRole: "OWNER",
  });

  await page.goto("/inbox");

  await expect(page.getByRole("button", { name: /Ayse Demir/ })).toBeVisible();
  await expect(page.getByText("Merhaba, siparisimin durumu nedir?")).toBeVisible();

  await page.getByPlaceholder("Mesaj yaz...").fill("Merhaba Ayse, siparisinizi kontrol ediyorum.");
  await page.getByRole("button", { name: "Gönder" }).click();
  await expect(
    page.getByText("Merhaba Ayse, siparisinizi kontrol ediyorum."),
  ).toBeVisible();

  await page
    .getByLabel("Atama")
    .selectOption({ label: "Ayla Owner (OWNER)" });
  await expect(page.getByLabel("Atama")).toHaveValue("membership_owner");

  await page.getByPlaceholder("Not ekle...").fill("Musteri kargo durumunu tekrar sorabilir.");
  await page.getByRole("button", { name: "Ekle" }).click();
  await expect(
    page.getByText("Musteri kargo durumunu tekrar sorabilir."),
  ).toBeVisible();

  await page.getByPlaceholder("Etiket ekle...").fill("Oncelikli");
  await page.getByPlaceholder("Etiket ekle...").press("Enter");
  await expect(
    page.getByRole("button", { name: "Oncelikli etiketini kaldır" }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Resolve", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Reopen", exact: true }),
  ).toBeVisible();
  await expect(page.getByText("Bu konuşma resolved durumda.")).toBeVisible();

  await page.getByRole("button", { name: "Reopen", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Resolve", exact: true }),
  ).toBeVisible();
});

test("team and channels keep owner-only management hidden for agents", async ({
  page,
}) => {
  await mockUnifiedInboxApi(page, {
    currentRole: "AGENT",
  });

  await page.goto("/settings/team");

  await expect(page.getByRole("heading", { name: "Team Settings" })).toBeVisible();
  await expect(
    page.getByText("Yönetim işlemleri yalnızca owner rolüne açıktır."),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Invite", exact: true })).toHaveCount(0);

  await page.getByRole("button", { name: "Channels" }).click();

  await expect(page.getByRole("heading", { name: "Channel Settings" })).toBeVisible();
  await expect(
    page.getByText("Yeni kanal bağlama işlemi yalnızca owner rolüne açıktır."),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Connect WhatsApp" }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Connect Instagram" }),
  ).toHaveCount(0);
  await expect(page.getByText("Connected Channels (2)")).toBeVisible();
});

test("owners can view and filter audit logs", async ({ page }) => {
  await mockUnifiedInboxApi(page, {
    currentRole: "OWNER",
  });

  await page.goto("/settings/audit-log");
  const auditTable = page.locator("table");

  await expect(page.getByRole("heading", { name: "Audit Log" })).toBeVisible();
  await expect(auditTable.getByText("INVITE_CREATED")).toBeVisible();
  await expect(auditTable.getByText("CHANNEL_CONNECTED")).toBeVisible();

  await page.getByLabel("Action").selectOption("INVITE_CREATED");
  await page.getByRole("button", { name: "Uygula" }).click();

  await expect(auditTable.getByText("INVITE_CREATED")).toBeVisible();
  await expect(auditTable.getByText("CHANNEL_CONNECTED")).toHaveCount(0);
});
