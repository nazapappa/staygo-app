
const db = window.supabase.createClient(
  'https://zjfcnojzstlwzxeldaqn.supabase.co',
  'sb_publishable_7PH45XJmmxUiZfobZQS6SA_1rtHRZ72'
);

const $ = id => document.getElementById(id);

let currentUser = null;
let currentProfile = null;
let currentStep = 1;
let busy = false;

function message(text, error = false) {
  $('accountMessage').textContent = text;
  $('accountMessage').style.color =
    error ? '#FF9999' : '#E6D9FF';
}

function show(id) {
  for (const name of [
    'loginView',
    'registerView',
    'profileView',
    'completeView'
  ]) {
    $(name).hidden = name !== id;
  }
  message('');
}

function setBusy(value) {
  busy = value;
  document.querySelectorAll('button').forEach(b => {
    b.disabled = value;
  });
}

async function run(action) {
  if (busy) return;
  setBusy(true);

  try {
    await action();
  } catch (error) {
    message(error.message || 'Operazione non riuscita.', true);
  } finally {
    setBusy(false);
  }
}

function showLogin() {
  show('loginView');
}

function showRegister() {
  show('registerView');
  setStep(1);
}

function setStep(step) {
  currentStep = step;

  document.querySelectorAll('[data-step]').forEach(el => {
    el.hidden = Number(el.dataset.step) !== step;
  });

  document.querySelectorAll('[data-progress]').forEach(el => {
    el.classList.toggle(
      'active',
      Number(el.dataset.progress) <= step
    );
  });

  $('stepNumber').textContent =
    '0' + step + ' / 03';
}

function adult(date) {
  if (!date) return false;

  const parts = date.split('-').map(Number);
  const birth = new Date(
    parts[0], parts[1] - 1, parts[2]
  );

  const now = new Date();

  let age = now.getFullYear() - birth.getFullYear();

  if (
    now.getMonth() < birth.getMonth() ||
    (
      now.getMonth() === birth.getMonth() &&
      now.getDate() < birth.getDate()
    )
  ) {
    age--;
  }

  return age >= 18 && age <= 120;
}

function normalizePhone(value) {
  return value.replace(/[\s()-]/g, '');
}

function validateIdentity(data) {
  if (!data.nome.trim() || !data.cognome.trim()) {
    throw Error('Inserisci nome e cognome.');
  }

  if (!adult(data.data_nascita)) {
    throw Error('Devi avere almeno 18 anni.');
  }

  if (data.paese_residenza.trim().length < 2) {
    throw Error('Inserisci il paese di residenza.');
  }
}

function validatePhone(phone) {
  if (!/^\+[1-9][0-9]{7,14}$/.test(phone)) {
    throw Error(
      'Inserisci il numero con prefisso internazionale, ad esempio +39.'
    );
  }
}

function registrationData() {
  return {
    nome: $('regNome').value.trim(),
    cognome: $('regCognome').value.trim(),
    data_nascita: $('regNascita').value,
    paese_residenza: $('regPaese').value.trim(),
    telefono: normalizePhone(
      $('regTelefono').value
    )
  };
}

function nextStep() {
  try {
    const data = registrationData();

    if (currentStep === 1) {
      validateIdentity(data);
    }

    if (currentStep === 2) {
      if (!$('regEmail').checkValidity()) {
        throw Error('Inserisci una email valida.');
      }

      validatePhone(data.telefono);

      const password = $('regPassword').value;

      if (password.length < 12) {
        throw Error(
          'La password deve contenere almeno 12 caratteri.'
        );
      }

      if (password !== $('regConfirm').value) {
        throw Error('Le password non coincidono.');
      }
    }

    message('');
    setStep(Math.min(3, currentStep + 1));

  } catch (error) {
    message(error.message, true);
  }
}

function previousStep() {
  message('');
  setStep(Math.max(1, currentStep - 1));
}

async function saveProfile(data) {
  validateIdentity(data);
  validatePhone(data.telefono);

  const { error } = await db.rpc(
    'staygo_compila_profilo',
    {
      p_nome: data.nome,
      p_cognome: data.cognome,
      p_data_nascita: data.data_nascita,
      p_paese: data.paese_residenza,
      p_telefono: data.telefono
    }
  );

  if (error) throw error;
}

async function acceptTerms() {
  const { error } = await db.rpc(
    'staygo_accetta_termini',
    {
      p_termini: true,
      p_privacy: true
    }
  );

  if (error) throw error;
}

async function register() {
  await run(async () => {
    const data = registrationData();

    validateIdentity(data);
    validatePhone(data.telefono);

    if (!$('regEmail').checkValidity()) {
      throw Error('Email non valida.');
    }

    if (
      $('regPassword').value.length < 12 ||
      $('regPassword').value !== $('regConfirm').value
    ) {
      throw Error('Controlla la password.');
    }

    if (
      !$('regTerms').checked ||
      !$('regPrivacy').checked ||
      !$('regAdult').checked
    ) {
      throw Error(
        'Completa tutte le conferme richieste.'
      );
    }

    const { data: result, error } =
      await db.auth.signUp({
        email: $('regEmail').value.trim(),
        password: $('regPassword').value,
        options: {
  emailRedirectTo:
    location.origin + '/account.html',

  data: {
    staygo_registration: {
      nome: data.nome,
      cognome: data.cognome,
      data_nascita: data.data_nascita,
      paese_residenza: data.paese_residenza,
      telefono: data.telefono,
      termini: $('regTerms').checked,
      privacy: $('regPrivacy').checked,
      maggiorenne: $('regAdult').checked,
      versione: 'bozza-1.0'
    }
  }
}
      });

    if (error) throw error;

    if (result.session) {
      await saveProfile(data);
      await acceptTerms();
      await initAccount();
    } else {
      $('registerForm').reset();
      showLogin();

      message(
        'Controlla la tua email. Dopo la conferma potrai accedere e completare il profilo.'
      );
    }
  });
}

async function login() {
  await run(async () => {
    const { error } =
      await db.auth.signInWithPassword({
        email: $('loginEmail').value.trim(),
        password: $('loginPassword').value
      });

    if (error) throw error;

    await initAccount();
  });
}

async function resetPassword() {
  await run(async () => {
    const email = $('loginEmail').value.trim();

    if (!email || !$('loginEmail').checkValidity()) {
      throw Error('Inserisci prima la tua email.');
    }

    const { error } =
      await db.auth.resetPasswordForEmail(email, {
        redirectTo:
          location.origin + '/reset-password.html'
      });

    if (error) throw error;

    message(
      'Se esiste un account associato, riceverai una email per recuperare la password.'
    );
  });
}

async function logout() {
  await run(async () => {
    const { error } = await db.auth.signOut();

    if (error) throw error;

    location.reload();
  });
}

function profileComplete(profile) {
  return Boolean(
    profile &&
    profile.nome &&
    profile.cognome &&
    adult(profile.data_nascita) &&
    profile.paese_residenza &&
    profile.telefono &&
    profile.termini_accettati_il &&
    profile.privacy_letta_il &&
    profile.versione_termini === 'bozza-1.0' &&
    profile.versione_privacy === 'bozza-1.0'
  );
}

function openEdit() {
  const p = currentProfile || {};

  show('completeView');

  $('editNome').value = p.nome || '';
  $('editCognome').value = p.cognome || '';
  $('editNascita').value = p.data_nascita || '';
  $('editPaese').value = p.paese_residenza || '';
  $('editTelefono').value = p.telefono || '';

  $('editTerms').checked =
    p.versione_termini === 'bozza-1.0' &&
    Boolean(p.termini_accettati_il);

  $('editPrivacy').checked =
    p.versione_privacy === 'bozza-1.0' &&
    Boolean(p.privacy_letta_il);
}

async function completeProfile() {
  await run(async () => {
    const data = {
      nome: $('editNome').value.trim(),
      cognome: $('editCognome').value.trim(),
      data_nascita: $('editNascita').value,
      paese_residenza: $('editPaese').value.trim(),
      telefono: normalizePhone(
        $('editTelefono').value
      )
    };

    if (
      !$('editTerms').checked ||
      !$('editPrivacy').checked
    ) {
      throw Error(
        'Conferma i termini e la presa visione della privacy.'
      );
    }

    await saveProfile(data);

    if (
      !currentProfile?.termini_accettati_il ||
      !currentProfile?.privacy_letta_il ||
      currentProfile?.versione_termini !== 'bozza-1.0' ||
      currentProfile?.versione_privacy !== 'bozza-1.0'
    ) {
      await acceptTerms();
    }

    await initAccount();

    message('Profilo aggiornato correttamente.');
  });
}

async function initAccount() {
  const { data, error } = await db.auth.getUser();

  currentUser = data?.user || null;

  if (!currentUser) {
    currentProfile = null;
    showLogin();
    return;
  }

  if (error) throw error;

  const result = await db
    .from('profili')
    .select('*')
    .eq('id', currentUser.id)
    .single();

  if (result.error) throw result.error;

  currentProfile = result.data;

// STAYGO SMART REGISTRATION

const pending =
  currentUser.user_metadata?.staygo_registration;

if (
  currentUser.email_confirmed_at &&
  pending &&
  !profileComplete(currentProfile) &&
  pending.versione === 'bozza-1.0' &&
  pending.termini === true &&
  pending.privacy === true &&
  pending.maggiorenne === true
) {

  try {

    await saveProfile({
      nome: pending.nome,
      cognome: pending.cognome,
      data_nascita: pending.data_nascita,
      paese_residenza: pending.paese_residenza,
      telefono: pending.telefono
    });

    await acceptTerms();

    const refreshed = await db
      .from('profili')
      .select('*')
      .eq('id', currentUser.id)
      .single();

    if (refreshed.error) {
      throw refreshed.error;
    }

    currentProfile = refreshed.data;

  } catch (error) {

    console.warn(
      'STAYGO: completamento automatico non riuscito'
    );

  }
}

if (pending && profileComplete(currentProfile)) {

  const cleanup = await db.auth.updateUser({
    data: {
      staygo_registration: null
    }
  });

  if (!cleanup.error) {
    currentUser = cleanup.data.user;
  }
}

if (!profileComplete(currentProfile)) {
    openEdit();
    message('Completa il tuo profilo STAYGO.');
    return;
  }

  show('profileView');

  $('profileName').textContent =
    currentProfile.nome + ' ' +
    currentProfile.cognome;

  $('profileEmail').textContent =
    currentUser.email || '';

  $('profilePhone').textContent =
    currentProfile.telefono;

  $('profileCountry').textContent =
    currentProfile.paese_residenza;

  $('profileBirth').textContent =
    currentProfile.data_nascita
      .split('-').reverse().join('/');

  $('emailStatus').textContent =
    currentUser.email_confirmed_at
      ? 'Email verificata'
      : 'Email da verificare';

  $('phoneStatus').textContent =
    currentProfile.telefono_verificato
      ? 'Telefono verificato'
      : 'Telefono da verificare';

  $('identityStatus').textContent =
    currentProfile.identita_verificata
      ? 'Identità verificata'
      : 'Identità da verificare';

  const admin = await db.rpc('is_staygo_admin');

  $('adminLink').hidden =
    admin.data !== true;
}

document.addEventListener('DOMContentLoaded', () => {
  $('loginForm').addEventListener('submit', e => {
    e.preventDefault();
    login();
  });

  $('registerForm').addEventListener('submit', e => {
    e.preventDefault();

    if (currentStep < 3) {
      nextStep();
    } else {
      register();
    }
  });

  $('completeForm').addEventListener('submit', e => {
    e.preventDefault();
    completeProfile();
  });

  initAccount().catch(error => {
    message(error.message, true);
  });
});
