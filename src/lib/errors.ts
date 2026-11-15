const MAP: Record<string, string> = {
  KOM_FORBIDDEN: 'Бұл әрекетке рұқсатыңыз жоқ.',
  KOM_INVALID_NAME: 'Аты-жөніңізді толық енгізіңіз.',
  KOM_INVALID_ROLE: 'Тіркелу түрі дұрыс емес.',
  KOM_INVALID_CURATOR: 'Таңдалған куратор қазір қолжетімсіз. Басқа куратор таңдаңыз.',
  KOM_REGISTRATION_CLOSED: 'Тіркелу уақытша жабық. Кейінірек қайталап көріңіз.',
  KOM_CONTACT_REQUIRED: 'Байланыс ақпаратын енгізіңіз.',
  KOM_NOT_FOUND: 'Деректер табылмады.',
  KOM_ALREADY_DECIDED: 'Бұл өтініш бұрын қарастырылған.',
  KOM_CANNOT_MANAGE_ORGANIZER: 'Организатор аккаунтын бұлай басқаруға болмайды.',
  KOM_NOT_APPROVED_YET: 'Бұл аккаунттың өтініші әлі мақұлданбаған.',
  KOM_STUDENT_NEEDS_CURATOR: 'Алдымен оқушыны белсенді кураторға ауыстырыңыз.',
  KOM_CURATOR_PLAN_LOCKED: 'Куратор жасаған жоспардың тек статусын өзгерте аласыз.',
  KOM_TASK_ALREADY_ACCEPTED: 'Тапсырма қабылданып қойған.',
  KOM_REPORT_LOCKED: 'Жіберілген есепті өзгертуге болмайды.',
  KOM_NO_STUDENTS: 'Кемінде бір оқушыны таңдаңыз.',
  KOM_TRACKER_EMPTY: 'Трекерге кемінде бір элемент қосыңыз.',
  KOM_TASK_URL_REQUIRED: 'Бұл тапсырма түрі үшін сілтеме (https://...) енгізіңіз.',
  KOM_TASK_CONFIG: 'Тапсырма баптауларын толық толтырыңыз.',
  KOM_TASK_LOCKED: 'Тапсырылған жауапты өзгертуге болмайды.',
  KOM_TEST_INVALID: 'Тест сұрақтарын тексеріңіз: әр сұрақтың мәтіні, нұсқалары және дұрыс жауабы болуы керек.',
  KOM_TEST_EMPTY: 'Тестке кемінде бір сұрақ қосыңыз.',
  KOM_TEST_DONE: 'Тест тапсырылып қойған.',
  KOM_TEST_NOT_STARTED: 'Тест әлі басталмаған.',
  KOM_TEST_HAS_ATTEMPTS: 'Оқушылар тестті тапсыра бастаған — сұрақтарды енді өзгертуге болмайды.',
  KOM_TEST_USE_RUNNER: 'Тест тек «Тестті бастау» батырмасы арқылы тапсырылады.',
  KOM_NOT_A_TEST: 'Бұл тапсырма тест емес.',
  KOM_TOO_MANY_FILES: 'Бір тапсырмаға 20 файлдан артық тіркеуге болмайды.',
};

export function humanError(err: unknown): string {
  const msg = typeof err === 'string' ? err : (err as { message?: string })?.message ?? '';
  for (const key of Object.keys(MAP)) if (msg.includes(key)) return MAP[key];
  if (/Invalid login credentials/i.test(msg)) return 'Пошта немесе құпиясөз қате.';
  if (/Email not confirmed/i.test(msg)) return 'Электронды поштаңызды растаңыз (поштаңызға хат жіберілді).';
  if (/already registered|already been registered|User already/i.test(msg)) return 'Бұл поштамен аккаунт бұрыннан тіркелген.';
  if (/Password should be|weak password/i.test(msg)) return 'Құпиясөз тым әлсіз: кемінде 8 таңба қолданыңыз.';
  if (/rate limit|too many/i.test(msg)) return 'Тым көп әрекет. Біраз уақыттан кейін қайталаңыз.';
  if (/row-level security|violates row-level/i.test(msg)) return 'Бұл әрекетке рұқсатыңыз жоқ.';
  if (/duplicate key/i.test(msg)) return 'Бұл жазба бұрыннан бар.';
  if (/check constraint/i.test(msg)) return 'Енгізілген деректерді тексеріңіз.';
  if (/maximum allowed size|Payload too large|exceeded the maximum/i.test(msg)) return 'Файл көлемі рұқсат етілгеннен үлкен.';
  if (/mime type|invalid_mime_type/i.test(msg)) return 'Бұл файл форматына рұқсат жоқ.';
  if (/Failed to fetch|NetworkError|network/i.test(msg)) return 'Желі байланысы жоқ. Интернетті тексеріңіз.';
  if (/Database error saving new user/i.test(msg)) return 'Тіркелу мүмкін болмады: деректерді тексеріп, қайталаңыз.';
  return 'Қате орын алды. Қайталап көріңіз.';
}
