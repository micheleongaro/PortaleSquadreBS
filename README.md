# Portale Squadre

Sito amatoriale tra amici per organizzare le partite: disponibilità, squadre, sfide, statistiche e classifiche.
Non affiliato, sponsorizzato né approvato da Supercell.

Funziona con **GitHub Pages** (gratis) + **Firebase piano Spark** (gratis).

---

## Messa online, passo per passo

### 1. Firebase: login con email e password
Console Firebase → **Sicurezza → Authentication** → **Inizia** → scheda *Metodo di accesso* → **Email/password** → attiva → **Salva**.

Facoltativo ma consigliato: in *Authentication → Impostazioni → Criteri delle password* attiva le regole (8 caratteri, maiuscola, minuscola, numero, carattere speciale), così valgono anche lato server.

In *Authentication → Modelli* puoi impostare la lingua delle email su **Italiano**.

### 2. Firebase: database
**Database e spazio di archiviazione → Firestore Database** → **Crea database** → località **europe-west** (es. `eur3` o `europe-west1`) → **modalità di produzione**.

### 3. Firebase: regole di sicurezza
Firestore Database → scheda **Regole** → cancella tutto, incolla il contenuto del file `firestore.rules` → **Pubblica**.

### 4. GitHub: carica il sito
1. Crea un repository pubblico, per esempio `portale-squadre`.
2. **Add file → Upload files** e trascina **il contenuto** di questa cartella (`index.html`, cartelle `css` e `js`, ecc.). `index.html` deve stare nella radice del repository.
3. **Commit changes**.
4. **Settings → Pages** → *Source*: **Deploy from a branch** → branch **main**, cartella **/(root)** → **Save**.
5. Dopo 1–2 minuti il sito è su `https://TUO-UTENTE.github.io/portale-squadre/`.

### 5. Firebase: autorizza il dominio di GitHub
Authentication → **Impostazioni → Domini autorizzati** → **Aggiungi dominio** → `TUO-UTENTE.github.io`.
Senza questo passo le email di verifica e di recupero password non funzionano.

### 6. Diventa amministratore
Apri il sito, clicca **Richiedi l'accesso** e registrati con **michele.ongaro@gmail.com**.
Verifica l'email: il tuo account viene approvato automaticamente e nel menu compare **Admin**.

Fatto! Ora chiunque può chiedere l'accesso; tu approvi dalla pagina Admin.

---

## Come funziona

- **Registrazione**: username (min. 8 caratteri, solo lettere e numeri, unico), email, telefono, password. Poi verifica email, poi approvazione dell'admin.
- **Ruoli**: amministratore (approva, banna, nomina organizzatori, risolve contestazioni); organizzatore per singola squadra (chi crea la squadra lo è in automatico); giocatore.
- **Delega**: dal Profilo un giocatore può far gestire le proprie disponibilità a un altro utente, e revocare quando vuole.
- **Disponibilità**: ricorrenti (ogni settimana) o su date specifiche, a mezz'ora.
- **Partite**: un giocatore propone → l'organizzatore approva → l'organizzatore avversario accetta → dopo la partita entrambi indicano il vincitore. Se coincidono vale, altrimenti decide l'admin. I giocatori possono fare appello.
- **Eventi esterni**: servono solo a organizzarsi, non contano in statistiche e classifiche.
- **Classifiche**: podio e "zona retrocessione" globali, win rate delle squadre.
- **Online**: un utente risulta online se ha la pagina aperta negli ultimi 3 minuti.

## Note
- La configurazione in `js/firebase-config.js` non è segreta: la sicurezza sta nelle regole.
- Se rifiuti una richiesta, l'account di accesso resta in *Authentication → Users*: puoi eliminarlo da lì se vuoi liberare l'email.
- Promemoria email 10 minuti prima delle partite e WhatsApp: fase 2, richiedono il piano Blaze.
- Il file `.nojekyll` dice a GitHub Pages di pubblicare i file così come sono.
