# Summer Database

App web per la gestione delle ville: calendario disponibilità, schede villa con listino acquisto/vendita, prenotazioni, appunti.

- **Modalità locale**: se `firebase-config.js` è vuoto, i dati restano nel browser.
- **Modalità online**: con la configurazione Firebase, i dati sono in Cloud Firestore e li vedono solo gli account Google autorizzati.

## Sicurezza: cosa protegge i dati

1. **Nessun dato nel codice.** Su GitHub c'è solo il programma. I dati (ville, prezzi, proprietari, clienti) stanno su Firestore. `seed.js`, i file Excel e i backup sono esclusi da `.gitignore`.
2. **Accesso con Google.** Per vedere qualcosa bisogna entrare con un account Google. Attiva la verifica in due passaggi su entrambi gli account: è la protezione più importante.
3. **Elenco di account ammessi** (`firestore.rules`). Il database risponde solo alle due email indicate. Chiunque altro riceve "permesso negato", anche se conosce l'indirizzo dell'app.
4. **Connessione cifrata** (HTTPS) e dati cifrati sui server Google.
5. **Content Security Policy** in `index.html`: la pagina può caricare script solo da sé stessa e da Google.

La `apiKey` in `firebase-config.js` non è una password: identifica il progetto ed è pubblica per tutte le app Firebase. La protezione vera sono i punti 2 e 3.

## Messa online (una volta sola)

### 1. Firebase
1. Vai su https://console.firebase.google.com → **Aggiungi progetto** (es. `summer-database`). Google Analytics non serve.
2. **Build → Authentication → Inizia → Google** → Attiva → Salva.
3. **Build → Firestore Database → Crea database** → località `eur3 (Europe)` → avvia in **modalità produzione**.
4. **Firestore → Regole**: incolla il contenuto di `firestore.rules`, sostituisci le due email con quelle vere, **Pubblica**.
5. **Impostazioni progetto (ingranaggio) → Le tue app → icona Web `</>`** → nome `summer-web` → registra. Copia i valori di `firebaseConfig` dentro `firebase-config.js`.
6. **Authentication → Impostazioni → Domini autorizzati**: aggiungi `TUONOME.github.io`.

### 2. GitHub Pages
1. Crea un repository (es. `summer-database`) e carica i file di questa cartella, **senza** `seed.js`.
2. **Settings → Pages → Branch `main` / root → Save**. Dopo un minuto l'app è su `https://TUONOME.github.io/summer-database/`.

### 3. Primo caricamento dei dati
Apri l'app, accedi con Google, vai su **Impostazioni → Importa backup** e scegli il file `dati-excel-summer-2027.json`. Le 86 ville e i 163 periodi finiscono su Firestore. Poi cancella quel file dal computer o tienilo in un posto sicuro.

### 4. Installazione
- **iPhone**: Safari → apri l'indirizzo → Condividi → *Aggiungi a schermata Home*.
- **Android**: Chrome → menu ⋮ → *Installa app*.
- **Mac**: Safari → File → *Aggiungi al Dock*, oppure Chrome → icona di installazione nella barra dell'indirizzo.

## Consigli
- Restringi la API key: Google Cloud Console → API e servizi → Credenziali → la chiave del browser → *Referrer HTTP* = `https://TUONOME.github.io/*`.
- Fai ogni tanto **Impostazioni → Esporta backup**.
- Se perdi un telefono: Google Account → Sicurezza → I tuoi dispositivi → esci da quel dispositivo.

## File

| File | Contenuto |
|---|---|
| `index.html`, `app.css`, `app.js` | interfaccia |
| `core.js` | periodi della stagione e formula del prezzo di vendita |
| `store.js` | salvataggio dati: locale oppure Firestore con accesso Google |
| `firebase-config.js` | configurazione del progetto Firebase |
| `firestore.rules` | regole di sicurezza del database (account ammessi) |
| `sw.js`, `manifest.webmanifest`, `icons/` | installazione su telefono e Mac, apertura offline |
