
const BIBLIA_API_KEY = '0cfbb093a3d964663a6965cc074f05e5';
const HF_API_KEY = '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';
const LIMIT = 5;
const MAX_QUIZ_TIME = 10 * 60 * 1000;
const CAROUSEL_INTERVAL = 5000;
const CAROUSEL_RESUME_DELAY = 10000;
const HF_MODEL = 'meta-llama/Meta-Llama-3-8B-Instruct';

let currentTranslation = 'EN';
let chapters = [];
let isCompactFormat = true;
let currentQuery = '';
let currentPage = 0;
let cachedResults = {};
let currentLang = 'EN';
let quizLang = 'EN';
let chapterCache = {};
let searchCache = {};
let bookCache = {};
let translationCache = {};
let activeSection = 'verse-selection';
let verses = [];
let questions = [];
let currentQuestion = 0;
let score = 0;
let startTime;
let timerInterval;
let quizSubmitted = false;
let currentSlide = 0;
let carouselInterval;
let isCarouselPaused = false;
let questionsLoaded = 0;

const frenchBookNames = {
  GEN: 'Genèse', EXO: 'Exode', LEV: 'Lévitique', NUM: 'Nombres', DEU: 'Deutéronome',
  JOS: 'Josué', JDG: 'Juges', RUT: 'Ruth', '1SA': '1 Samuel', '2SA': '2 Samuel',
  '1KI': '1 Rois', '2KI': '2 Rois', '1CH': '1 Chroniques', '2CH': '2 Chroniques',
  EZR: 'Esdras', NEH: 'Néhémie', EST: 'Esther', JOB: 'Job', PSA: 'Psaumes',
  PRO: 'Proverbes', ECC: 'Ecclésiaste', SNG: 'Cantique des Cantiques', ISA: 'Ésaïe',
  JER: 'Jérémie', LAM: 'Lamentations', EZK: 'Ézéchiel', DAN: 'Daniel', HOS: 'Osée',
  JOL: 'Joël', AMO: 'Amos', OBA: 'Abdias', JON: 'Jonas', MIC: 'Michée',
  NAM: 'Nahum', HAB: 'Habacuc', ZEP: 'Sophonie', HAG: 'Aggée', ZEC: 'Zacharie',
  MAL: 'Malachie', MAT: 'Matthieu', MRK: 'Marc', LUK: 'Luc', JHN: 'Jean',
  ACT: 'Actes', ROM: 'Romains', '1CO': '1 Corinthiens', '2CO': '2 Corinthiens',
  GAL: 'Galates', EPH: 'Éphésiens', PHP: 'Philippiens', COL: 'Colossiens',
  '1TH': '1 Thessaloniciens', '2TH': '2 Thessaloniciens', '1TI': '1 Timothée',
  '2TI': '2 Timothée', TIT: 'Tite', PHM: 'Philémon', HEB: 'Hébreux',
  JAS: 'Jacques', '1PE': '1 Pierre', '2PE': '2 Pierre', '1JN': '1 Jean',
  '2JN': '2 Jean', '3JN': '3 Jean', JUD: 'Jude', REV: 'Apocalypse'
};

const bookOrder = [
  'GEN', 'EXO', 'LEV', 'NUM', 'DEU', 'JOS', 'JDG', 'RUT', '1SA', '2SA',
  '1KI', '2KI', '1CH', '2CH', 'EZR', 'NEH', 'EST', 'JOB', 'PSA', 'PRO',
  'ECC', 'SNG', 'ISA', 'JER', 'LAM', 'EZK', 'DAN', 'HOS', 'JOL', 'AMO',
  'OBA', 'JON', 'MIC', 'NAM', 'HAB', 'ZEP', 'HAG', 'ZEC', 'MAL',
  'MAT', 'MRK', 'LUK', 'JHN', 'ACT', 'ROM', '1CO', '2CO', 'GAL', 'EPH',
  'PHP', 'COL', '1TH', '2TH', '1TI', '2TI', 'TIT', 'PHM', 'HEB', 'JAS',
  '1PE', '2PE', '1JN', '2JN', '3JN', 'JUD', 'REV'
];

function debounce(func, wait) {
  let timeout;
  return function (...args) {
    clearTimeout(timeout);
    timeout = setTimeout(() => func(...args), wait);
  };
}

async function batchFetch(urls, headers = {}) {
  const responses = await Promise.all(urls.map(url =>
    fetch(url, { headers }).then(res => res.ok ? res.json() : Promise.reject(`HTTP ${res.status}: Failed to fetch ${url}`))
  ));
  return responses;
}

async function translate(text, from = 'EN', to = 'FR') {
  if (from === to || !text) return text;
  const cacheKey = `${text}:${from}:${to}`;
  if (translationCache[cacheKey]) return translationCache[cacheKey];
  try {
    const model = from === 'EN' && to === 'FR' ? 'Helsinki-NLP/opus-mt-en-fr' : 'Helsinki-NLP/opus-mt-fr-en';
    const response = await fetch(`https://api-inference.huggingface.co/models/${model}`, {
      headers: { 'Authorization': `Bearer ${HF_API_KEY}`, 'Content-Type': 'application/json' },
      method: 'POST',
      body: JSON.stringify({ inputs: text })
    });
    if (!response.ok) throw new Error(`Translation error (${response.status})`);
    const result = await response.json();
    const translatedText = result[0]?.translation_text || text;
    translationCache[cacheKey] = translatedText;
    return translatedText;
  } catch (err) {
    console.error('Translation error:', err);
    return text;
  }
}

async function loadBooks(translation) {
  if (!translation) return;
  if (bookCache[translation]) {
    populateBooks(bookCache[translation], translation);
    return;
  }
  try {
    const data = await fetch(`https://bible-api.com/data/web`).then(res => res.json());
    bookCache[translation] = data.books;
    populateBooks(data.books, translation);
  } catch (error) {
    console.error('Error loading books:', error);
    document.getElementById('verseContent').innerHTML = `<p class="text-red-500">Error: ${error.message}</p>`;
  }
}

function populateBooks(books, translation) {
  const bookSelect = document.getElementById('book');
  bookSelect.innerHTML = '<option value="">Select a Book</option>';
  books.forEach(book => {
    const option = document.createElement('option');
    option.value = book.id;
    option.textContent = translation === 'FR' ? frenchBookNames[book.id] || book.name : book.name;
    bookSelect.appendChild(option);
  });
}

async function loadChapters(translation, bookId) {
  if (!translation || !bookId) return;
  try {
    const data = await fetch(`https://bible-api.com/data/web/${bookId}`).then(res => res.json());
    chapters = data.chapters;
    const chapterSelect = document.getElementById('chapter');
    chapterSelect.innerHTML = '<option value="">Select a Chapter</option>';
    chapters.forEach(chapter => {
      const option = document.createElement('option');
      option.value = chapter.chapter;
      option.textContent = chapter.chapter;
      chapterSelect.appendChild(option);
    });
    updateNavigationButtons();
  } catch (error) {
    console.error('Error loading chapters:', error);
    document.getElementById('verseContent').innerHTML = `<p class="text-red-500">Error: ${error.message}</p>`;
  }
}

async function loadVerses(translation, bookId, chapter) {
  if (!translation || !bookId || !chapter) return;
  const cacheKey = `${bookId}-${chapter}`;
  if (chapterCache[cacheKey]?.[translation.toLowerCase()]) {
    populateVerses(chapterCache[cacheKey][translation.toLowerCase()], translation);
    return;
  }
  try {
    const data = await fetch(`https://bible-api.com/data/web/${bookId}/${chapter}`).then(res => res.json());
    const verses = data.verses;
    const translatedVerses = translation === 'FR' ? await Promise.all(verses.map(async v => ({
      ...v,
      text: await translate(v.text, 'EN', 'FR')
    }))) : verses;
    chapterCache[cacheKey] = {
      en: verses,
      fr: translation === 'FR' ? translatedVerses : verses
    };
    populateVerses(translatedVerses, translation);
  } catch (error) {
    console.error('Error loading verses:', error);
    document.getElementById('verseContent').innerHTML = `<p class="text-red-500">Error: ${error.message}</p>`;
  }
}

function populateVerses(verses, translation) {
  const verseSelect = document.getElementById('verse');
  verseSelect.innerHTML = '<option value="">Select a Verse</option>';
  verses.forEach(verse => {
    const option = document.createElement('option');
    option.value = verse.verse;
    option.textContent = verse.verse;
    verseSelect.appendChild(option);
  });
}

async function showHighlightedChapter(translation, bookId, chapter, selectedVerse = null, updateHighlightOnly = false) {
  if (!translation || !bookId || !chapter) return;
  const cacheKey = `${bookId}-${chapter}`;
  let verses = chapterCache[cacheKey]?.[translation.toLowerCase()];
  if (!verses) {
    try {
      const data = await fetch(`https://bible-api.com/data/web/${bookId}/${chapter}`).then(res => res.json());
      const rawVerses = data.verses;
      verses = translation === 'FR' ? await Promise.all(rawVerses.map(async v => ({
        ...v,
        text: await translate(v.text, 'EN', 'FR')
      }))) : rawVerses;
      chapterCache[cacheKey] = chapterCache[cacheKey] || {};
      chapterCache[cacheKey][translation.toLowerCase()] = verses;
      chapterCache[cacheKey].en = chapterCache[cacheKey].en || rawVerses;
    } catch (error) {
      console.error('Error showing chapter:', error);
      document.getElementById('verseContent').innerHTML = `<p class="text-red-500">Error: ${error.message}</p>`;
      return;
    }
  }

  const verseContent = document.getElementById('verseContent');
  const bookName = translation === 'FR' ? frenchBookNames[bookId] || bookId : verses[0]?.book || bookId;

  if (updateHighlightOnly) {
    const allVerses = verseContent.querySelectorAll('.verse-selected, .compact-verse, .verse-normal');
    allVerses.forEach(el => {
      const verseNum = el.querySelector('sup')?.textContent || el.textContent.match(/:(\d+)/)?.[1];
      el.className = isCompactFormat ? (verseNum === selectedVerse ? 'verse-selected' : 'compact-verse') : (verseNum === selectedVerse ? 'verse-selected' : 'verse-normal');
    });
    const selectedEl = verseContent.querySelector('.verse-selected');
    if (selectedEl) selectedEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
    return;
  }

  verseContent.innerHTML = '<p class="text-gray-500">Loading...</p>';
  if (isCompactFormat) {
    const heading = `<h3 class="text-xl font-semibold text-blue-800 mb-4">${bookName} ${chapter}</h3>`;
    const verseText = verses.map(v => {
      const isSelected = selectedVerse && v.verse.toString() === selectedVerse;
      return `<span class="${isSelected ? 'verse-selected' : 'compact-verse'}"><sup>${v.verse}</sup> ${v.text}</span>`;
    }).join('');
    verseContent.innerHTML = `${heading}<p>${verseText}</p><div id="chapterNavBottom" class="chapter-nav-bottom show"><button id="prevChapterBtnBottom" class="bg-gray-600 text-white px-4 py-2 rounded-lg hover:bg-gray-700 shadow-md transition-all disabled:bg-gray-400">Previous</button><button id="nextChapterBtnBottom" class="bg-gray-600 text-white px-4 py-2 rounded-lg hover:bg-gray-700 shadow-md transition-all disabled:bg-gray-400">Next</button></div>`;
  } else {
    verseContent.innerHTML = verses.map(v => {
      const isSelected = selectedVerse && v.verse.toString() === selectedVerse;
      return `<div class="${isSelected ? 'verse-selected' : 'verse-normal'}"><strong>${bookName} ${v.chapter}:${v.verse}:</strong> ${v.text}</div>`;
    }).join('') + '<div id="chapterNavBottom" class="chapter-nav-bottom show"><button id="prevChapterBtnBottom" class="bg-gray-600 text-white px-4 py-2 rounded-lg hover:bg-gray-700 shadow-md transition-all disabled:bg-gray-400">Previous</button><button id="nextChapterBtnBottom" class="bg-gray-600 text-white px-4 py-2 rounded-lg hover:bg-gray-700 shadow-md transition-all disabled:bg-gray-400">Next</button></div>';
  }
  verseContent.classList.add('fade-in');
  if (selectedVerse) {
    const selectedEl = verseContent.querySelector('.verse-selected');
    if (selectedEl) selectedEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
  updateNavigationButtons(chapter);
  document.getElementById('prevChapterBtnBottom').addEventListener('click', () => navigateChapter('prev'));
  document.getElementById('nextChapterBtnBottom').addEventListener('click', () => navigateChapter('next'));
}

async function displayPage(page) {
  const pageData = cachedResults[page];
  const searchResults = document.getElementById('searchResults');
  const errorDiv = document.getElementById('error');
  const prevBtn = document.getElementById('prevSearchBtn');
  const nextBtn = document.getElementById('nextSearchBtn');
  const navBottom = document.getElementById('searchNavBottom');

  if (!pageData || pageData.length === 0) {
    searchResults.innerHTML = '<p class="text-gray-500 italic">No results found.</p>';
    prevBtn.disabled = page === 0;
    nextBtn.disabled = true;
    navBottom.classList.add('hidden');
    return;
  }

  searchResults.innerHTML = '';
  const translations = await Promise.all(pageData.map(item => translate(item.preview, 'EN', currentLang)));
  pageData.forEach((item, i) => {
    const div = document.createElement('div');
    div.className = 'verse';
    const reference = currentLang === 'FR' ? item.title.replace(/(\d+[A-Za-z]*)/, match => frenchBookNames[match] || match).replace(/\./g, ':') : item.title.replace(/\./g, ':');
    div.innerHTML = `<h3>${reference}</h3><p>${translations[i]}</p>`;
    searchResults.appendChild(div);
  });

  prevBtn.disabled = page === 0;
  nextBtn.disabled = pageData.length < LIMIT;
  navBottom.classList.remove('hidden');
  searchResults.classList.add('fade-in');
  searchResults.scrollIntoView({ behavior: 'smooth' });
}

async function fetchPage(query, page, lang) {
  const cacheKey = `${query}-${lang}`;
  if (searchCache[cacheKey]?.[page]) {
    cachedResults[page] = searchCache[cacheKey][page];
    await displayPage(page);
    return;
  }

  const searchResults = document.getElementById('searchResults');
  const errorDiv = document.getElementById('error');
  searchResults.innerHTML = '<p class="text-gray-500">Loading...</p>';
  errorDiv.textContent = '';

  try {
    const startIndex = page * LIMIT;
    const url = `https://api.biblia.com/v1/bible/search/LEB.js?query=${encodeURIComponent(query)}&mode=verse&start=${startIndex}&limit=${LIMIT}&key=${BIBLIA_API_KEY}`;
    const data = await fetch(url).then(res => res.json());
    cachedResults[page] = data.results || [];
    searchCache[cacheKey] = searchCache[cacheKey] || {};
    searchCache[cacheKey][page] = data.results || [];
    await displayPage(page);
  } catch (err) {
    searchResults.innerHTML = '';
    errorDiv.textContent = err.message;
    document.getElementById('prevSearchBtn').disabled = true;
    document.getElementById('nextSearchBtn').disabled = true;
  }
}

async function searchBible(translation, query) {
  if (!query.trim()) {
    updateSearchResults('<p class="text-gray-500 italic">Please enter a search term.</p>');
    return;
  }

  let queryText = query;
  currentLang = document.getElementById('langSelect').value;
  if (currentLang === 'FR') queryText = await translate(query, 'FR', 'EN');

  currentQuery = queryText;
  currentPage = 0;
  cachedResults = {};
  document.getElementById('searchNavBottom').classList.add('hidden');
  await fetchPage(currentQuery, currentPage, currentLang);
}

function updateSearchResults(content) {
  const searchResults = document.getElementById('searchResults');
  if (searchResults) searchResults.innerHTML = content;
}

function updateNavigationButtons(currentChapter = null) {
  const prevBtn = document.getElementById('prevChapterBtn');
  const nextBtn = document.getElementById('nextChapterBtn');
  const prevBtnBottom = document.getElementById('prevChapterBtnBottom');
  const nextBtnBottom = document.getElementById('nextChapterBtnBottom');
  if (!chapters.length || !currentChapter) {
    [prevBtn, nextBtn, prevBtnBottom, nextBtnBottom].forEach(btn => btn && (btn.disabled = true));
    return;
  }
  const chapterNumbers = chapters.map(ch => parseInt(ch.chapter));
  const current = parseInt(currentChapter);
  [prevBtn, prevBtnBottom].forEach(btn => btn && (btn.disabled = current <= chapterNumbers[0]));
  [nextBtn, nextBtnBottom].forEach(btn => btn && (btn.disabled = current >= chapterNumbers[chapterNumbers.length - 1]));
}

async function navigateChapter(direction) {
  const bookId = document.getElementById('book').value;
  const chapterSelect = document.getElementById('chapter');
  const currentChapter = chapterSelect.value;
  if (!bookId || !currentChapter || !chapters.length) return;
  const chapterNumbers = chapters.map(ch => parseInt(ch.chapter));
  const currentIndex = chapterNumbers.indexOf(parseInt(currentChapter));
  let newIndex = direction === 'prev' ? currentIndex - 1 : currentIndex + 1;
  if (newIndex >= 0 && newIndex < chapterNumbers.length) {
    const newChapter = chapterNumbers[newIndex].toString();
    chapterSelect.value = newChapter;
    await loadVerses(currentTranslation, bookId, newChapter);
    await showHighlightedChapter(currentTranslation, bookId, newChapter);
  } else if (direction === 'next' && newIndex >= chapterNumbers.length) {
    const currentBookIndex = bookOrder.indexOf(bookId);
    if (currentBookIndex < bookOrder.length - 1) {
      const nextBookId = bookOrder[currentBookIndex + 1];
      document.getElementById('book').value = nextBookId;
      await loadChapters(currentTranslation, nextBookId);
      chapterSelect.value = '1';
      await loadVerses(currentTranslation, nextBookId, '1');
      await showHighlightedChapter(currentTranslation, nextBookId, '1');
    }
  } else if (direction === 'prev' && newIndex < 0) {
    const currentBookIndex = bookOrder.indexOf(bookId);
    if (currentBookIndex > 0) {
      const prevBookId = bookOrder[currentBookIndex - 1];
      document.getElementById('book').value = prevBookId;
      await loadChapters(currentTranslation, prevBookId);
      const lastChapter = chapters[chapters.length - 1].chapter;
      chapterSelect.value = lastChapter;
      await loadVerses(currentTranslation, prevBookId, lastChapter);
      await showHighlightedChapter(currentTranslation, prevBookId, lastChapter);
    }
  }
}

async function navigateVerse(direction) {
  const bookId = document.getElementById('book').value;
  const chapter = document.getElementById('chapter').value;
  const verseSelect = document.getElementById('verse');
  const currentVerse = verseSelect.value;
  if (!bookId || !chapter || !currentVerse) return;
  const cacheKey = `${bookId}-${chapter}`;
  const verses = chapterCache[cacheKey]?.[currentTranslation.toLowerCase()];
  if (!verses) return;
  const verseNumbers = verses.map(v => parseInt(v.verse));
  const currentIndex = verseNumbers.indexOf(parseInt(currentVerse));
  let newIndex = direction === 'prev' ? currentIndex - 1 : currentIndex + 1;
  if (newIndex >= 0 && newIndex < verseNumbers.length) {
    const newVerse = verseNumbers[newIndex].toString();
    verseSelect.value = newVerse;
    await showHighlightedChapter(currentTranslation, bookId, chapter, newVerse, true);
  } else if (direction === 'next' && newIndex >= verseNumbers.length) {
    const chapterNumbers = chapters.map(ch => parseInt(ch.chapter));
    const currentChapterIndex = chapterNumbers.indexOf(parseInt(chapter));
    if (currentChapterIndex < chapterNumbers.length - 1) {
      const newChapter = chapterNumbers[currentChapterIndex + 1].toString();
      document.getElementById('chapter').value = newChapter;
      await loadVerses(currentTranslation, bookId, newChapter);
      const newVerse = '1';
      verseSelect.value = newVerse;
      await showHighlightedChapter(currentTranslation, bookId, newChapter, newVerse);
    } else {
      const currentBookIndex = bookOrder.indexOf(bookId);
      if (currentBookIndex < bookOrder.length - 1) {
        const nextBookId = bookOrder[currentBookIndex + 1];
        document.getElementById('book').value = nextBookId;
        await loadChapters(currentTranslation, nextBookId);
        document.getElementById('chapter').value = '1';
        await loadVerses(currentTranslation, nextBookId, '1');
        const newVerse = '1';
        verseSelect.value = newVerse;
        await showHighlightedChapter(currentTranslation, nextBookId, '1', newVerse);
      }
    }
  } else if (direction === 'prev' && newIndex < 0) {
    const chapterNumbers = chapters.map(ch => parseInt(ch.chapter));
    const currentChapterIndex = chapterNumbers.indexOf(parseInt(chapter));
    if (currentChapterIndex > 0) {
      const prevChapter = chapterNumbers[currentChapterIndex - 1].toString();
      document.getElementById('chapter').value = prevChapter;
      await loadVerses(currentTranslation, bookId, prevChapter);
      const lastVerse = chapterCache[`${bookId}-${prevChapter}`]?.[currentTranslation.toLowerCase()]?.slice(-1)[0]?.verse.toString() || '1';
      verseSelect.value = lastVerse;
      await showHighlightedChapter(currentTranslation, bookId, prevChapter, lastVerse);
    } else {
      const currentBookIndex = bookOrder.indexOf(bookId);
      if (currentBookIndex > 0) {
        const prevBookId = bookOrder[currentBookIndex - 1];
        document.getElementById('book').value = prevBookId;
        await loadChapters(currentTranslation, prevBookId);
        const lastChapter = chapters[chapters.length - 1].chapter;
        document.getElementById('chapter').value = lastChapter;
        await loadVerses(currentTranslation, prevBookId, lastChapter);
        const lastVerse = chapterCache[`${prevBookId}-${lastChapter}`]?.[currentTranslation.toLowerCase()]?.slice(-1)[0]?.verse.toString() || '1';
        verseSelect.value = lastVerse;
        await showHighlightedChapter(currentTranslation, prevBookId, lastChapter, lastVerse);
      }
    }
  }
}

function toggleFormat() {
  isCompactFormat = !isCompactFormat;
  const toggleBtn = document.getElementById('toggleFormatBtn');
  toggleBtn.textContent = isCompactFormat ? 'Original Format' : 'Compact Format';
  const bookId = document.getElementById('book').value;
  const chapter = document.getElementById('chapter').value;
  const verse = document.getElementById('verse').value;
  if (bookId && chapter) showHighlightedChapter(currentTranslation, bookId, chapter, verse || null);
}

function updateNavigationMessage() {
  const navInfo = document.getElementById('navInfo');
  const navigateChapters = document.getElementById('navigateChapters').checked;
  navInfo.textContent = currentTranslation === 'FR' ?
    `Utilisez les touches ← et → pour naviguer dans les ${navigateChapters ? 'chapitres' : 'versets'}.` :
    `Use ← and → keys to navigate ${navigateChapters ? 'chapters' : 'verses'}.`;
}

async function updateQuizUIText() {
  const introText = document.getElementById('intro-text');
  const scoreText = document.getElementById('score-text');
  const reviewText = document.getElementById('review-text');
  const carouselInstructions = document.getElementById('carousel-instructions');
  const startBtn = document.getElementById('start-btn');
  const submitBtn = document.getElementById('submit-btn');
  const restartBtn = document.getElementById('restart-btn');

  if (quizLang === 'FR') {
    introText.textContent = await translate('Welcome to the Bible Quiz! Answer 10 questions based on random Bible verses. You have 10 minutes to complete the quiz.', 'EN', 'FR');
    scoreText.innerHTML = `Votre score : <span id="score"></span>/10`;
    reviewText.textContent = await translate('Review Answers', 'EN', 'FR');
    carouselInstructions.textContent = await translate('Navigate with Arrow Left/Right keys. Pause/Play with the Pause key or button.', 'EN', 'FR');
    startBtn.textContent = await translate('Start Game', 'EN', 'FR');
    submitBtn.textContent = await translate('Submit Quiz', 'EN', 'FR');
    restartBtn.textContent = await translate('Restart Quiz', 'EN', 'FR');
  } else {
    introText.textContent = 'Welcome to the Bible Quiz! Answer 10 questions based on random Bible verses. You have 10 minutes to complete the quiz.';
    scoreText.innerHTML = 'Your Score: <span id="score"></span>/10';
    reviewText.textContent = 'Review Answers';
    carouselInstructions.textContent = 'Navigate with Arrow Left/Right keys. Pause/Play with the Pause key or button.';
    startBtn.textContent = 'Start Game';
    submitBtn.textContent = 'Submit Quiz';
    restartBtn.textContent = 'Restart Quiz';
  }
}

async function query(data) {
  try {
    const response = await fetch('https://router.huggingface.co/v1/chat/completions', {
      headers: {
        Authorization: `Bearer ${HF_API_KEY}`,
        'Content-Type': 'application/json',
      },
      method: 'POST',
      body: JSON.stringify(data),
    });
    if (!response.ok) throw new Error(`HuggingFace API error: ${response.status}`);
    return await response.json();
  } catch (error) {
    console.error('HuggingFace query error:', error);
    throw error;
  }
}

async function fetchRandomVerse() {
  try {
    const data = await fetch('https://bible-api.com/data/web/random').then(res => res.json());
    return data.random_verse;
  } catch (error) {
    console.error('Error fetching verse:', error);
    return {
      book: '1 Chronicles',
      chapter: 20,
      verse: 4,
      text: 'After this, war arose at Gezer with the Philistines. Then Sibbecai the Hushathite killed Sippai, of the sons of the giant; and they were subdued.'
    };
  }
}

async function generateQuestion(verse) {
  const isFrench = quizLang === 'FR';
  const verseText = isFrench ? await translate(verse.text, 'EN', 'FR') : verse.text;
  const bookName = isFrench ? frenchBookNames[verse.book] || verse.book : verse.book;
  const fullRef = `${bookName} ${verse.chapter}:${verse.verse}`;
  const userPrompt = isFrench ?
    `Voici un verset biblique : "${verseText}" (${fullRef}). Générez une seule question à choix multiple (QCM) en français basée sur ce verset. Fournissez exactement 4 options avec une seule correcte. Les distracteurs doivent être plausibles et dérivés d'autres parties de la Bible (par exemple, noms, lieux ou événements bibliques). Répondez uniquement avec un objet JSON : {"question": "...", "options": ["...", "...", "...", "..."], "correctAnswer": 0 ou 1 ou 2 ou 3}` :
    `Here is a Bible verse: "${verse.text}" (${fullRef}). Generate a single multiple-choice question (QCM) based on this verse. Provide exactly 4 options with only one correct. The distractors should be plausible and derived from other parts of the Bible (e.g., biblical names, places, or events). Respond only with a JSON object: {"question": "...", "options": ["...", "...", "...", "..."], "correctAnswer": 0 or 1 or 2 or 3}`;

  const data = {
    model: HF_MODEL,
    messages: [
      {
        role: 'system',
        content: isFrench ?
          'Vous êtes un assistant qui génère des questions à choix multiple en français. Répondez uniquement avec un objet JSON contenant une question, exactement quatre options, et l\'index de la réponse correcte : {"question": "...", "options": ["...", "...", "...", "..."], "correctAnswer": 0 ou 1 ou 2 ou 3}.' :
          'You are a helpful assistant that generates multiple-choice questions. Respond only with a JSON object containing a question, exactly four options, and the index of the correct answer: {"question": "...", "options": ["...", "...", "...", "..."], "correctAnswer": 0 or 1 or 2 or 3}.',
      },
      { role: 'user', content: userPrompt },
    ],
  };

  try {
    const result = await query(data);
    const text = result.choices[0]?.message?.content?.trim();
    let qcm = JSON.parse(text);
    if (!qcm.question || !Array.isArray(qcm.options) || qcm.options.length !== 4 || !Number.isInteger(qcm.correctAnswer) || qcm.correctAnswer < 0 || qcm.correctAnswer > 3) {
      throw new Error('Invalid QCM format');
    }
    qcm.verse = { ...verse, fullRef: isFrench ? fullRef : `${verse.book} ${verse.chapter}:${verse.verse}` };
    return qcm;
  } catch (error) {
    console.error('Error generating question:', error);
    return {
      question: isFrench ?
        `Quel est l'événement clé dans ${fullRef} ?` :
        `What is the key event in ${fullRef}?`,
      options: [
        verseText.substring(0, 20) + '...',
        isFrench ? 'Le couronnement de David' : 'David’s coronation',
        isFrench ? 'La construction du temple' : 'Temple construction',
        isFrench ? 'Le déluge au temps de Noé' : 'Flood in Noah’s time'
      ],
      correctAnswer: 0,
      verse: { ...verse, fullRef }
    };
  }
}

async function generateQuiz() {
  verses = [];
  questions = [];
  questionsLoaded = 0;
  document.getElementById('questions').innerHTML = quizLang === 'FR' ?
    `<p class="loading">Chargement de la question ${questionsLoaded + 1}/10...</p>` :
    `<p class="loading">Loading question ${questionsLoaded + 1}/10...</p>`;
  document.getElementById('quiz').style.display = 'block';
  document.getElementById('intro').style.display = 'none';
  document.getElementById('carousel').innerHTML = '';

  const versePromises = Array(10).fill().map(() => fetchRandomVerse());
  const fetchedVerses = await Promise.all(versePromises.map(p => p.catch(e => ({
    book: '1 Chronicles',
    chapter: 20,
    verse: 4,
    text: 'After this, war arose at Gezer with the Philistines. Then Sibbecai the Hushathite killed Sippai, of the sons of the giant; and they were subdued.'
  }))));
  verses = fetchedVerses;

  const questionPromises = verses.map(verse => generateQuestion(verse).then(q => {
    questionsLoaded++;
    document.getElementById('questions').innerHTML = quizLang === 'FR' ?
      `<p class="loading">Chargement de la question ${questionsLoaded}/10...</p>` :
      `<p class="loading">Loading question ${questionsLoaded}/10...</p>`;
    questions.push(q);
    if (questionsLoaded === 1) {
      displayQuestion();
      startTimer();
    }
    return q;
  }).catch(e => {
    questionsLoaded++;
    const fullRef = quizLang === 'FR' ? `${frenchBookNames[verse.book] || verse.book} ${verse.chapter}:${verse.verse}` : `${verse.book} ${verse.chapter}:${verse.verse}`;
    const fallback = {
      question: quizLang === 'FR' ? `Quel est l'événement clé dans ${fullRef} ?` : `What is the key event in ${fullRef}?`,
      options: [
        (quizLang === 'FR' ? verse.text : verse.text).substring(0, 20) + '...',
        quizLang === 'FR' ? 'Le couronnement de David' : 'David’s coronation',
        quizLang === 'FR' ? 'La construction du temple' : 'Temple construction',
        quizLang === 'FR' ? 'Le déluge au temps de Noé' : 'Flood in Noah’s time'
      ],
      correctAnswer: 0,
      verse: { ...verse, fullRef }
    };
    questions.push(fallback);
    if (questionsLoaded === 1) {
      displayQuestion();
      startTimer();
    }
    return fallback;
  }));

  await Promise.all(questionPromises);
  displayQuestion();
}

function startTimer() {
  startTime = Date.now();
  timerInterval = setInterval(() => {
    const elapsed = Date.now() - startTime;
    if (elapsed >= MAX_QUIZ_TIME) {
      submitQuiz();
    } else {
      const minutes = Math.floor(elapsed / 60000);
      const seconds = Math.floor((elapsed % 60000) / 1000);
      document.getElementById('timer').textContent = quizLang === 'FR' ?
        `Temps : ${minutes}:${seconds.toString().padStart(2, '0')}` :
        `Time: ${minutes}:${seconds.toString().padStart(2, '0')}`;
    }
  }, 1000);
}

function displayQuestion() {
  const questionsDiv = document.getElementById('questions');
  if (questions.length === 0) {
    questionsDiv.innerHTML = quizLang === 'FR' ?
      '<p class="loading">Chargement de la question 1/10...</p>' :
      '<p class="loading">Loading question 1/10...</p>';
    return;
  }
  questionsDiv.innerHTML = '';
  questions.forEach((q, index) => {
    const div = document.createElement('div');
    div.className = `question ${index === currentQuestion ? 'active' : ''}`;
    div.innerHTML = `
      <h3>Question ${index + 1}: ${q.question}</h3>
      <div class="options">
        ${q.options.map((opt, optIndex) => `
          <div class="option ${q.selected === optIndex ? 'selected' : ''}" data-index="${optIndex}">
            ${String.fromCharCode(65 + optIndex)}. ${opt}
          </div>
        `).join('')}
      </div>
    `;
    questionsDiv.appendChild(div);
  });
  updateNavigation();
}

function updateNavigation() {
  document.getElementById('prev-btn').disabled = currentQuestion === 0;
  document.getElementById('next-btn').disabled = currentQuestion === questions.length - 1 || questions.length < 10;
  document.getElementById('submit-btn').style.display = currentQuestion === questions.length - 1 && questions.length === 10 ? 'inline-block' : 'none';
}

function selectOption(questionIndex, optionIndex) {
  if (quizSubmitted) return;
  const questionDiv = document.querySelectorAll('.question')[questionIndex];
  if (questionDiv) {
    questionDiv.querySelectorAll('.option').forEach(opt => opt.classList.remove('selected'));
    const selectedOption = questionDiv.querySelector(`[data-index="${optionIndex}"]`);
    if (selectedOption) selectedOption.classList.add('selected');
    questions[questionIndex].selected = optionIndex;
    displayQuestion();
  }
}

function nextQuestion() {
  if (questions.length > 0 && currentQuestion < questions.length - 1) {
    currentQuestion++;
    displayQuestion();
  }
}

function prevQuestion() {
  if (questions.length > 0 && currentQuestion > 0) {
    currentQuestion--;
    displayQuestion();
  }
}

async function submitQuiz() {
  if (quizSubmitted) return;
  quizSubmitted = true;
  clearInterval(timerInterval);
  clearInterval(carouselInterval);
  const endTime = Date.now();
  const timeTaken = Math.floor((endTime - startTime) / 1000);
  score = questions.reduce((acc, q) => acc + (q.selected === q.correctAnswer ? 1 : 0), 0);
  document.getElementById('score').textContent = score;
  document.getElementById('time-taken').textContent = quizLang === 'FR' ?
    `Temps pris : ${Math.floor(timeTaken / 60)}:${(timeTaken % 60).toString().padStart(2, '0')}` :
    `Time taken: ${Math.floor(timeTaken / 60)}:${(timeTaken % 60).toString().padStart(2, '0')}`;
  document.getElementById('quiz').style.display = 'none';
  document.getElementById('results').style.display = 'block';
  await displayCarousel();
  startCarousel();
}

function restartQuiz() {
  verses = [];
  questions = [];
  currentQuestion = 0;
  score = 0;
  startTime = null;
  clearInterval(timerInterval);
  clearInterval(carouselInterval);
  quizSubmitted = false;
  currentSlide = 0;
  isCarouselPaused = false;
  questionsLoaded = 0;
  document.getElementById('pause-btn').textContent = quizLang === 'FR' ? 'Pause' : 'Pause';
  document.getElementById('results').style.display = 'none';
  document.getElementById('intro').style.display = 'block';
  document.getElementById('score').textContent = '';
  document.getElementById('time-taken').textContent = '';
  document.getElementById('timer').textContent = '';
  document.getElementById('questions').innerHTML = '';
  document.getElementById('carousel').innerHTML = '';
}

async function displayCarousel() {
  const carousel = document.getElementById('carousel');
  carousel.innerHTML = '';
  if (questions.length === 0) {
    carousel.innerHTML = quizLang === 'FR' ?
      '<p class="error">Aucune question disponible. Veuillez réessayer.</p>' :
      '<p class="error">No questions available. Please try again.</p>';
    return;
  }
  for (const [index, q] of questions.entries()) {
    const verseText = quizLang === 'FR' ? await translate(q.verse.text, 'EN', 'FR') : q.verse.text;
    const slide = document.createElement('div');
    slide.className = `carousel-slide ${index === 0 ? 'active' : ''}`;
    const isCorrect = q.selected === q.correctAnswer;
    const correctLabel = quizLang === 'FR' ? ' (Correct)' : ' (Correct)';
    const incorrectLabel = quizLang === 'FR' ? ' (Incorrect)' : ' (Incorrect)';
    const notAnsweredLabel = quizLang === 'FR' ? 'Non répondu' : 'Not answered';
    slide.innerHTML = `
      <h4>Question ${index + 1}</h4>
      <p>${q.question}</p>
      <div class="verse">${verseText}</div>
      <p class="reference">Reference: ${q.verse.fullRef}</p>
      <div>
        ${q.options.map((opt, optIndex) => {
          const cls = optIndex === q.correctAnswer ? 'correct' : (optIndex === q.selected && q.selected !== undefined && !isCorrect ? 'incorrect' : 'default');
          const mark = optIndex === q.correctAnswer ? correctLabel : '';
          return `<p class="carousel-option ${cls}">${String.fromCharCode(65 + optIndex)}. ${opt}${mark}</p>`;
        }).join('')}
      </div>
      <p class="user-answer">${quizLang === 'FR' ? 'Votre réponse : ' : 'Your answer: '} ${q.selected !== undefined ? q.options[q.selected] : notAnsweredLabel} ${isCorrect ? correctLabel : q.selected !== undefined ? incorrectLabel : ''}</p>
    `;
    carousel.appendChild(slide);
  }
}

function startCarousel() {
  if (!isCarouselPaused && questions.length > 0) {
    clearInterval(carouselInterval);
    carouselInterval = setInterval(nextSlide, CAROUSEL_INTERVAL);
  }
}

function pauseCarousel() {
  clearInterval(carouselInterval);
}

function toggleCarousel() {
  if (questions.length === 0) return;
  isCarouselPaused = !isCarouselPaused;
  document.getElementById('pause-btn').textContent = isCarouselPaused ? (quizLang === 'FR' ? 'Jouer' : 'Play') : 'Pause';
  if (isCarouselPaused) {
    pauseCarousel();
  } else {
    startCarousel();
  }
}

function nextSlide() {
  const slides = document.querySelectorAll('.carousel-slide');
  if (slides.length === 0) return;
  slides.forEach(slide => slide.classList.remove('active'));
  currentSlide = (currentSlide + 1) % slides.length;
  slides[currentSlide].classList.add('active');
  if (!isCarouselPaused) {
    pauseCarousel();
    setTimeout(startCarousel, CAROUSEL_RESUME_DELAY);
  }
}

function prevSlide() {
  const slides = document.querySelectorAll('.carousel-slide');
  if (slides.length === 0) return;
  slides.forEach(slide => slide.classList.remove('active'));
  currentSlide = (currentSlide - 1 + slides.length) % slides.length;
  slides[currentSlide].classList.add('active');
  if (!isCarouselPaused) {
    pauseCarousel();
    setTimeout(startCarousel, CAROUSEL_RESUME_DELAY);
  }
}

const debouncedNavigateChapter = debounce(navigateChapter, 300);
const debouncedNavigateVerse = debounce(navigateVerse, 300);
const debouncedSearchNext = debounce(() => {
  currentPage++;
  fetchPage(currentQuery, currentPage, currentLang);
}, 300);
const debouncedSearchPrev = debounce(() => {
  if (currentPage > 0) {
    currentPage--;
    displayPage(currentPage);
  }
}, 300);

document.addEventListener('DOMContentLoaded', () => {
  loadBooks('EN');
  updateNavigationMessage();
  updateQuizUIText();
  document.getElementById('verse-selection').classList.add('section-active');

  document.querySelectorAll('.section').forEach(section => {
    section.addEventListener('click', () => {
      document.querySelectorAll('.section').forEach(s => s.classList.remove('section-active'));
      section.classList.add('section-active');
      activeSection = section.id;
    });
  });

  document.getElementById('translation').addEventListener('change', async (e) => {
    const newTranslation = e.target.value || 'EN';
    if (newTranslation === currentTranslation) return; // Avoid unnecessary reloads
    currentTranslation = newTranslation;
    currentLang = currentTranslation;
    document.getElementById('langSelect').value = currentTranslation;
    updateNavigationMessage();

    const bookId = document.getElementById('book').value;
    const chapter = document.getElementById('chapter').value;
    const verse = document.getElementById('verse').value;

    // Reset selections to ensure clean state
    document.getElementById('book').innerHTML = '<option value="">Select a Book</option>';
    document.getElementById('chapter').innerHTML = '<option value="">Select a Chapter</option>';
    document.getElementById('verse').innerHTML = '<option value="">Select a Verse</option>';
    document.getElementById('verseContent').innerHTML = '';

    // Reload books
    await loadBooks(currentTranslation);

    // Restore previous selections if applicable
    if (bookId) {
      document.getElementById('book').value = bookId;
      await loadChapters(currentTranslation, bookId);
      if (chapter) {
        document.getElementById('chapter').value = chapter;
        // Explicitly load verses with the new translation
        await loadVerses(currentTranslation, bookId, chapter);
        if (verse) {
          document.getElementById('verse').value = verse;
          await showHighlightedChapter(currentTranslation, bookId, chapter, verse);
        } else {
          await showHighlightedChapter(currentTranslation, bookId, chapter);
        }
      }
    }

    // Handle search results if a query exists
    if (currentQuery) {
      cachedResults = {};
      const cacheKey = `${currentQuery}-${currentLang}`;
      if (searchCache[cacheKey]?.[currentPage]) {
        cachedResults[currentPage] = searchCache[cacheKey][currentPage];
        await displayPage(currentPage);
      } else {
        document.getElementById('searchResults').innerHTML = '';
        await fetchPage(currentQuery, currentPage, currentLang);
      }
    } else {
      document.getElementById('searchResults').innerHTML = '';
    }

    // Update quiz carousel if submitted
    if (quizSubmitted) await displayCarousel();
  });

  document.getElementById('book').addEventListener('change', (e) => {
    const bookId = e.target.value;
    chapters = [];
    chapterCache = {};
    loadChapters(currentTranslation, bookId);
    document.getElementById('chapter').innerHTML = '<option value="">Select a Chapter</option>';
    document.getElementById('verse').innerHTML = '<option value="">Select a Verse</option>';
    document.getElementById('verseContent').innerHTML = '';
    updateNavigationButtons();
  });

  document.getElementById('chapter').addEventListener('change', (e) => {
    const chapter = e.target.value;
    const bookId = document.getElementById('book').value;
    loadVerses(currentTranslation, bookId, chapter);
    showHighlightedChapter(currentTranslation, bookId, chapter);
  });

  document.getElementById('verse').addEventListener('change', (e) => {
    const verse = e.target.value;
    const bookId = document.getElementById('book').value;
    const chapter = document.getElementById('chapter').value;
    if (verse) showHighlightedChapter(currentTranslation, bookId, chapter, verse, true);
  });

  document.getElementById('showVerseBtn').addEventListener('click', () => {
    const verse = document.getElementById('verse').value;
    const bookId = document.getElementById('book').value;
    const chapter = document.getElementById('chapter').value;
    if (verse) showHighlightedChapter(currentTranslation, bookId, chapter, verse);
  });

  document.getElementById('prevChapterBtn').addEventListener('click', () => navigateChapter('prev'));
  document.getElementById('nextChapterBtn').addEventListener('click', () => navigateChapter('next'));
  document.getElementById('toggleFormatBtn').addEventListener('click', toggleFormat);
  document.getElementById('navigateChapters').addEventListener('change', updateNavigationMessage);

  document.getElementById('searchInput').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && activeSection === 'search-container-unique') {
      const query = document.getElementById('searchInput').value.trim();
      searchBible(currentTranslation, query);
    }
  });

  document.getElementById('searchBtn').addEventListener('click', () => {
    const query = document.getElementById('searchInput').value.trim();
    searchBible(currentTranslation, query);
  });

  document.getElementById('prevSearchBtn').addEventListener('click', debouncedSearchPrev);
  document.getElementById('nextSearchBtn').addEventListener('click', debouncedSearchNext);

  document.getElementById('langSelect').addEventListener('change', async () => {
    const newLang = document.getElementById('langSelect').value;
    if (newLang === currentLang) return; // Avoid unnecessary reloads
    currentLang = newLang;
    currentTranslation = currentLang;
    document.getElementById('translation').value = currentLang;
    updateNavigationMessage();

    const bookId = document.getElementById('book').value;
    const chapter = document.getElementById('chapter').value;
    const verse = document.getElementById('verse').value;

    // Reset selections to ensure clean state
    document.getElementById('book').innerHTML = '<option value="">Select a Book</option>';
    document.getElementById('chapter').innerHTML = '<option value="">Select a Chapter</option>';
    document.getElementById('verse').innerHTML = '<option value="">Select a Verse</option>';
    document.getElementById('verseContent').innerHTML = '';

    // Reload books
    await loadBooks(currentTranslation);

    // Restore previous selections if applicable
    if (bookId) {
      document.getElementById('book').value = bookId;
      await loadChapters(currentTranslation, bookId);
      if (chapter) {
        document.getElementById('chapter').value = chapter;
        // Explicitly load verses with the new translation
        await loadVerses(currentTranslation, bookId, chapter);
        if (verse) {
          document.getElementById('verse').value = verse;
          await showHighlightedChapter(currentTranslation, bookId, chapter, verse);
        } else {
          await showHighlightedChapter(currentTranslation, bookId, chapter);
        }
      }
    }

    // Handle search results if a query exists
    if (currentQuery) {
      cachedResults = {};
      const cacheKey = `${currentQuery}-${currentLang}`;
      if (searchCache[cacheKey]?.[currentPage]) {
        cachedResults[currentPage] = searchCache[cacheKey][currentPage];
        await displayPage(currentPage);
      } else {
        document.getElementById('searchResults').innerHTML = '';
        await fetchPage(currentQuery, currentPage, currentLang);
      }
    } else {
      document.getElementById('searchResults').innerHTML = '';
    }

    // Update quiz carousel if submitted
    if (quizSubmitted) await displayCarousel();
  });

  document.getElementById('quiz-lang').addEventListener('change', async () => {
    quizLang = document.getElementById('quiz-lang').value;
    await updateQuizUIText();
    if (quizSubmitted) await displayCarousel();
  });

  document.getElementById('start-btn').addEventListener('click', () => {
    generateQuiz();
  });

  document.getElementById('submit-btn').addEventListener('click', async () => {
    await submitQuiz();
  });

  document.getElementById('restart-btn').addEventListener('click', restartQuiz);

  document.addEventListener('click', (e) => {
    if (e.target.classList.contains('option')) {
      const optIndex = parseInt(e.target.dataset.index);
      selectOption(currentQuestion, optIndex);
    }
  });

  document.getElementById('prev-btn').addEventListener('click', prevQuestion);
  document.getElementById('next-btn').addEventListener('click', nextQuestion);
  document.getElementById('carousel-prev').addEventListener('click', prevSlide);
  document.getElementById('carousel-next').addEventListener('click', nextSlide);
  document.getElementById('pause-btn').addEventListener('click', toggleCarousel);

  document.addEventListener('keydown', async (e) => {
    if (activeSection === 'verse-selection') {
      const navigateChapters = document.getElementById('navigateChapters').checked;
      if (navigateChapters) {
        if (e.key === 'ArrowRight') await debouncedNavigateChapter('next');
        if (e.key === 'ArrowLeft') await debouncedNavigateChapter('prev');
      } else {
        if (e.key === 'ArrowRight') await debouncedNavigateVerse('next');
        if (e.key === 'ArrowLeft') await debouncedNavigateVerse('prev');
      }
    } else if (activeSection === 'search-container-unique') {
      if (currentQuery && e.key === 'ArrowRight' && document.activeElement !== document.getElementById('searchInput')) {
        debouncedSearchNext();
      }
      if (currentQuery && e.key === 'ArrowLeft' && currentPage > 0 && document.activeElement !== document.getElementById('searchInput')) {
        debouncedSearchPrev();
      }
    } else if (activeSection === 'quiz-section') {
      if (document.getElementById('quiz').style.display === 'block' && !quizSubmitted) {
        if (e.key === 'ArrowLeft') prevQuestion();
        else if (e.key === 'ArrowRight') nextQuestion();
      } else if (quizSubmitted && document.getElementById('results').style.display === 'block') {
        if (e.key === 'ArrowLeft') prevSlide();
        else if (e.key === 'ArrowRight') nextSlide();
        else if (e.key === 'Pause') toggleCarousel();
      }
    }
  });
});
  