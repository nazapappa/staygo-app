
const db = window.supabase?.createClient(
  'https://zjfcnojzstlwzxeldaqn.supabase.co',
  'sb_publishable_7PH45XJmmxUiZfobZQS6SA_1rtHRZ72'
);

const bucket = 'alloggi-foto';
const $ = id => document.getElementById(id);

function msg(id, text) {
  if ($(id)) $(id).textContent = text;
}

function node(tag, text) {
  const n = document.createElement(tag);
  n.textContent = text;
  return n;
}

function link(text, url) {
  const a = node('a', text);
  a.href = url;
  a.className = 'outline';
  return a;
}

async function showPhotos(a, container) {
  if (!Array.isArray(a.foto)) return;

  const gallery = document.createElement('div');

  gallery.style.cssText =
    'display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:10px;margin:15px 0';

  container.prepend(gallery);

  for (const path of a.foto.slice(0, 10)) {
    const { data, error } = await db.storage
      .from(bucket)
      .createSignedUrl(path, 120);

    if (!error && data?.signedUrl) {
      const img = document.createElement('img');
      img.src = data.signedUrl;
      img.alt = 'Fotografia alloggio';
      img.style.cssText =
        'width:100%;height:180px;object-fit:cover;border-radius:10px';

      gallery.append(img);
    }
  }
}

function card(a) {
  const n = document.createElement('article');
  n.className = 'panel';

  n.append(
    node('h3', a.titolo),
    node('p', a.citta + ' · ' + a.tipologia +
      ' · €' + a.prezzo_notte + ' / notte · ' +
      a.ospiti + ' ospiti'),
    node('p', a.descrizione)
  );

  showPhotos(a, n).catch(console.error);

  return n;
}

let stays = [];

function filterStays() {
  if (!$('stays')) return;

  const city = $('city').value.toLowerCase();
  const kind = $('kind').value;
  const budget = +$('budget').value;

  const arr = stays.filter(a =>
    a.citta.toLowerCase().includes(city) &&
    (!kind || a.tipologia.toLowerCase().replace('&', '') === kind) &&
    (!budget || a.prezzo_notte <= budget)
  );

  $('stays').replaceChildren(...arr.map(card));
  msg('count', arr.length + ' annunci approvati');
}

const tf = $('travelForm');

if (tf) {
  tf.addEventListener('submit', e => {
    e.preventDefault();

    const d = new FormData(tf);
    const r = $('travelResult');

    r.classList.remove('hidden');

    r.textContent =
      'Idea di viaggio simulata: ' +
      d.get('days') + ' a ' +
      d.get('destination') +
      ', con focus ' + d.get('style') +
      '. Verifica sempre costi e disponibilità reali.';
  });
}

async function init() {
  if (!db) throw Error('Connessione non disponibile');

  const { data: { user } } = await db.auth.getUser();

  const admin = user
    ? await db.rpc('is_staygo_admin')
    : null;

  const isAdmin = admin?.data === true;

  if ($('accountForm')) {
    const f = $('accountForm');

    f.hidden = !!user;

    if (user) {
      msg('accountMessage',
        'Accesso effettuato: ' + user.email);

      $('accountLinks').append(
        link('I miei annunci', 'annunci.html')
      );

      if (isAdmin) {
        $('accountLinks').append(
          link('STAYGO Control', 'control.html')
        );
      }

      const b = node('button', 'Esci');

      b.onclick = async () => {
        await db.auth.signOut();
        location.reload();
      };

      $('accountLinks').append(b);
    }

    f.onsubmit = async e => {
      e.preventDefault();

      const d = new FormData(f);

      const v = {
        email: d.get('email').trim(),
        password: d.get('password')
      };

      const r = e.submitter?.value === 'signup'
        ? await db.auth.signUp({
            ...v,
            options: {
              emailRedirectTo:
                location.origin + '/account.html'
            }
          })
        : await db.auth.signInWithPassword(v);

      if (r.error) {
        msg('accountMessage', r.error.message);
      } else if (r.data.session) {
        location.reload();
      } else {
        msg('accountMessage',
          'Controlla la tua email.');
      }
    };
  }

  if ($('hostForm')) {
    const f = $('hostForm');

    if (!user) {
      f.hidden = true;

      $('hostMessage').append(
        link('Accedi per proporre un alloggio',
          'account.html')
      );

    } else {
      f.hidden = false;

      f.onsubmit = async e => {
        e.preventDefault();

        const d = new FormData(f);
        const b = f.querySelector('button');

        const files = Array.from(
          $('hostPhotos')?.files || []
        );

        if (files.length < 1 || files.length > 10) {
          msg('hostMessage',
            'Seleziona da 1 a 10 fotografie.');
          return;
        }

        const formats = {
          'image/jpeg': 'jpg',
          'image/png': 'png',
          'image/webp': 'webp'
        };

        for (const file of files) {
          if (!formats[file.type]) {
            msg('hostMessage',
              'Utilizza immagini JPEG, PNG o WebP.');
            return;
          }

          if (file.size > 5 * 1024 * 1024) {
            msg('hostMessage',
              'Ogni foto deve pesare massimo 5 MB.');
            return;
          }
        }

        b.disabled = true;

        const paths = [];
        const listingId = crypto.randomUUID();

        try {
          for (let i = 0; i < files.length; i++) {
            const file = files[i];

            msg('hostMessage',
              'Caricamento foto ' +
              (i + 1) + ' di ' + files.length);

            const path =
              user.id + '/' +
              listingId + '/' +
              crypto.randomUUID() + '.' +
              formats[file.type];

            const { error } = await db.storage
              .from(bucket)
              .upload(path, file, {
                upsert: false,
                contentType: file.type
              });

            if (error) throw error;

            paths.push(path);
          }

          const { error } = await db
            .from('alloggi')
            .insert({
              id: listingId,
              titolo: d.get('title'),
              citta: d.get('city'),
              tipologia: d.get('type'),
              ospiti: +d.get('guests'),
              prezzo_notte: +d.get('price'),
              descrizione: d.get('description'),
              cin: d.get('cin') || null,
              servizi: d.get('services')
                .split(',')
                .map(x => x.trim())
                .filter(Boolean),
              foto: paths
            });

          if (error) throw error;

          f.reset();

          msg('hostMessage',
            'Annuncio e fotografie inviati. In attesa di approvazione.');

        } catch (e) {
          msg('hostMessage',
            'Errore: ' + e.message +
            (paths.length
              ? '. Alcune foto potrebbero essere rimaste archiviate.'
              : ''));
        } finally {
          b.disabled = false;
        }
      };
    }
  }

  if ($('drafts')) {
    if (!user) {
      $('drafts').append(
        link('Accedi', 'account.html')
      );

    } else {
      const { data, error } = await db
        .from('alloggi')
        .select('*')
        .eq('proprietario_id', user.id);

      if (error) throw error;

      for (const a of data) {
        const n = card(a);

        n.append(node('p', 'Stato: ' + a.stato));

        $('drafts').append(n);
      }

      if (!data.length) {
        msg('drafts', 'Nessun annuncio');
      }
    }
  }

  if ($('adminList')) {
    if (!isAdmin) {
      $('adminList').replaceChildren(
        node('p', 'Accesso riservato.'),
        link('Accedi', 'account.html')
      );

    } else {
      const { data, error } = await db
        .from('alloggi')
        .select('*')
        .order('creato_il', {
          ascending: false
        });

      if (error) throw error;

      $('adminList').replaceChildren();

      for (const a of data) {
        const n = card(a);

        n.append(
          node('p', 'CIN: ' +
            (a.cin || 'non inserito')),
          node('p', 'Stato: ' + a.stato)
        );

        for (const [s, t] of [
          ['approvato', 'Approva'],
          ['rifiutato', 'Rifiuta'],
          ['da_modificare', 'Richiedi modifiche'],
          ['sospeso', 'Sospendi']
        ]) {
          const b = node('button', t);

          b.onclick = async () => {
            if (!confirm(t + ' questo annuncio?')) return;

            b.disabled = true;

            const { data, error } = await db
              .from('alloggi')
              .update({ stato: s })
              .eq('id', a.id)
              .eq('stato', a.stato)
              .select('id');

            if (error || !data?.length) {
              alert(error?.message ||
                'Modifica non autorizzata.');
              b.disabled = false;
            } else {
              location.reload();
            }
          };

          n.append(b);
        }

        $('adminList').append(n);
      }

      if (!data.length) {
        msg('adminList',
          'Nessuna proposta ricevuta');
      }
    }
  }

  if ($('stays')) {
    const { data, error } = await db
      .from('alloggi')
      .select('id,titolo,citta,tipologia,ospiti,prezzo_notte,descrizione,foto')
      .eq('stato', 'approvato');

    if (error) throw error;

    stays = data;
    filterStays();
  }
}

init().catch(e => {
  for (const id of [
    'accountMessage',
    'hostMessage',
    'drafts',
    'adminList',
    'count'
  ]) {
    msg(id, 'Errore: ' + e.message);
  }
});
