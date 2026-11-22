// About & Credits — every source with the attribution and links its terms require (mirrors THIRD_PARTY_LICENSES.md).
const A = ({ href, children }: { href: string; children: preact.ComponentChildren }) => (
  <a href={href} target="_blank" rel="noopener">
    {children}
  </a>
);

export default function CreditsScreen() {
  return (
    <>
      <div class="task-now" style={{ marginBottom: 14 }}>
        <b>YOUR TASK NOW:</b> nothing to do here — go back to <a href="#/today">Today</a>.
      </div>
      <div class="card">
        <h2>About</h2>
        <p>
          Tilawa Coach is a personal, <b>non-commercial</b> study app (no ads, no payments, no tracking). It is not a
          teacher: please check your recitation with a qualified teacher. Automatic feedback always shows how sure it
          is, and says "possible" when it is unsure.
        </p>
        <p class="small muted">Your recordings and career notes stay on this device unless you choose to share them.</p>
      </div>
      <div class="card">
        <h2>Quran text</h2>
        <p>
          <b>Tanzil Quran Text</b> (Uthmani, Version 1.1), © 2007–2026 Tanzil Project — <A href="https://tanzil.net">tanzil.net</A>.
          Used verbatim (never changed), with pause marks and sajdah signs. Licence: verbatim copies allowed with credit
          and a link to tanzil.net (file header: Creative Commons Attribution 3.0). Quran metadata © 2008–2009
          Tanzil.info (cc-by).
        </p>
        <p>
          Translations (hidden until you tap): <b>Ali Quli Qarai</b> and <b>Mohammad Habib Shakir</b>, via{' '}
          <A href="https://tanzil.net/trans/">tanzil.net/trans</A> — non-commercial use only.
        </p>
      </div>
      <div class="card">
        <h2>Tajweed colours and word timings</h2>
        <p>
          Tajweed rule locations: <A href="https://github.com/cpfair/quran-tajweed">cpfair/quran-tajweed</A> by Collin
          Fair (CC BY 4.0), regenerated on the current Tanzil text.
        </p>
        <p>
          Word timings: <A href="https://github.com/cpfair/quran-align">cpfair/quran-align</A> by Collin Fair (CC BY 4.0),
          remapped and sanitised (repairs logged). Licence: <A href="https://creativecommons.org/licenses/by/4.0/">CC BY 4.0</A>.
        </p>
        <p>
          Cross-check: the rule locations were compared with the <A href="https://quran.com">Quran.com</A> (Quran Foundation)
          tajweed text, and with this app's own rule check (written from the rule definitions, sharing no code with either);
          places where they disagree are marked "ask a teacher". No Quran.com data is stored in this app.
        </p>
      </div>
      <div class="card">
        <h2>Recitation audio</h2>
        <p>
          <b>Sheikh Muhammad Siddiq al-Minshawi</b> — murattal and mujawwad recordings streamed from{' '}
          <A href="https://everyayah.com">EveryAyah</A>.
        </p>
        <p>
          Minshawi with children: audio and timings from the <A href="https://quran.foundation">Quran Foundation</A> (Quran.com,
          QuranicAudio). Fetched only when you use it, kept at most 7 days, for personal non-commercial use.
        </p>
      </div>
      <div class="card">
        <h2>Videos</h2>
        <p>
          YouTube videos play in the official YouTube player (youtube-nocookie.com): the Nuraniah Qaida lessons
          ("القاعدة النورانية", teacher reading by Eng. Mohammad Farouk Al-Raee), Mulla Basim al-Karbalai, and Mulla
          Mohammad Baqer al-Khaqani. Nothing is downloaded or re-hosted. The Nuraniah book and method are copyrighted;
          the drills in this app are our own.
        </p>
      </div>
      <div class="card">
        <h2>Font and software</h2>
        <p>
          <b>Amiri Quran</b> © The Amiri Project Authors — <A href="https://github.com/aliftype/amiri">SIL Open Font License 1.1</A>{' '}
          (<a href="fonts/AmiriQuran-OFL.txt">licence text</a>).
        </p>
        <p class="small">
          Preact, @preact/signals, idb, ts-fsrs, zod, Workbox (MIT/ISC); built with Vite and TypeScript. Full list:
          THIRD_PARTY_LICENSES.md in the repository.
        </p>
      </div>
    </>
  );
}
