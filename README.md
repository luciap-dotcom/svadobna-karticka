# 💍 Virtuálna svadobná kartička (v štýle The Office)

Stránka, na ktorú kolegovia cez link nechajú **verejný** alebo **tajný** odkaz.
Tajné odkazy odomkne len ženích cez heslo, ktoré si zvolíš ty.

---

## 1. Nastavenie (spravíš raz)

Otvor súbor **`config.json`** a uprav si:

```json
{
  "groomName": "Meno ženícha",
  "brideName": "Meno nevesty",
  "weddingDate": "2026-06-13",
  "secretPassword": "TAJNE-HESLO-PRE-ZENICHA",
  "pageTitle": "Svadobná kartička ..."
}
```

- `secretPassword` = heslo, ktorým ženích odomkne tajné odkazy. **Toto pošli len jemu.**
- `weddingDate` je vo formáte `RRRR-MM-DD`.

---

## 2. Spustenie na tvojom počítači (na vyskúšanie)

Potrebuješ nainštalovaný [Node.js](https://nodejs.org) (verzia 18+).

V priečinku appky spusti:

```bash
npm install
npm start
```

Potom otvor v prehliadači: **http://localhost:3000**

Odkazy sa ukladajú do súboru `data/messages.json` (vznikne automaticky).

> Pozn.: `localhost` funguje len tebe na tvojom počítači. Aby na to dosiahli kolegovia
> cez link, treba appku nasadiť online — viď ďalší krok.

---

## 3. Nasadenie online zadarmo (aby kolegovia dosiahli cez link)

Najjednoduchšie cez **[Render.com](https://render.com)** (má zadarmo úroveň):

1. Nahraj tento priečinok na GitHub (nový repozitár).
2. Na Renderi: **New → Web Service** → pripoj repozitár.
3. Nastav:
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
4. V sekcii **Environment** pridaj premennú:
   - `SECRET_PASSWORD` = tvoje tajné heslo (aby nebolo priamo v kóde na GitHube).
5. Deploy → dostaneš verejný link typu `https://tvoja-karticka.onrender.com` — ten pošli kolegom. 🎉

### Aby odkazy nemizli (bezplatná databáza v tom istom Render účte)

Free web služba má dočasný disk — pri reštarte/uspatí by sa odkazy stratili.
Preto ich ukladáme do **bezplatnej Render Postgres databázy** (žiadny nový účet):

1. V Renderi: **New → Postgres** → zvoľ **Free** plán → vytvor.
2. Otvor databázu a skopíruj **Internal Database URL**.
3. Vráť sa do svojej web služby → **Environment** → pridaj premennú:
   - `DATABASE_URL` = (vložená Internal Database URL z kroku 2)
4. Ulož → služba sa nasadí nanovo a odkazy sa odteraz ukladajú do databázy. ✅

> ✅ Odkazy prežijú reštart aj uspatie. Ak `DATABASE_URL` nie je nastavená
> (napr. lokálne u teba), appka použije súbor `data/messages.json` ako predtým.
>
> ⏳ Free web služba sa po ~15 min nečinnosti uspí → prvý návštevník počká ~30–50 s.
> Odkazy sa nestratia, sú bezpečne v databáze.
>
> 🗓️ Render **free databáza sa po ~30 dňoch zmaže** — na jednorazovú svadbu stačí.

> ⚠️ Firemné pravidlá: over si, či smieš nasadiť appku na verejný cloud.
> Alternatívne to vieš spustiť aj na firemnom serveri — kód sa nemení.

---

## Ako to funguje

- **Ktokoľvek s linkom** môže pridať odkaz (meno je nepovinné → dá sa aj anonymne).
- Pri písaní si zvolí **verejný** alebo **🔒 tajný** odkaz.
- **Tajné odkazy** sa nikdy neposielajú do prehliadača bez správneho hesla — vidí ich len ženích.
- Každý môže **upraviť/zmazať svoj vlastný** odkaz (funguje na tom istom zariadení/prehliadači, kde ho písal).

## Súbory

| Súbor | Čo robí |
|-------|---------|
| `config.json` | mená, dátum, tajné heslo |
| `server.js` | server + API + ukladanie |
| `public/` | samotná stránka (HTML/CSS/JS) |
| `data/messages.json` | uložené odkazy (vznikne sám) |
