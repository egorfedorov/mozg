import type { Dictionary } from "@/lib/i18n";

/**
 * The operator's panel, in ru.
 *
 * The key is the English sentence; the value is this language's. A value may
 * also be a table of forms of a counted word ({ one, few, many, other }) where
 * the language has more forms than English does.
 */
export const ru: Dictionary = {

  // admin/AdminClient.tsx
  "System": "Система",
  "Chat": "Чат",
  "Errors": "Ошибки",
  "Announcements": "Объявления",
  "Launches": "Запуски",
  "mozg, to the site": "mozg, на сайт",
  "Operator": "Оператор",
  "Language": "Язык",
  "Log out": "Выйти",

  // admin/views/Announcements.tsx
  "News": "Новость",
  "Notice": "Заметка",
  "Maintenance": "Технические работы",
  "Post an announcement": "Опубликовать объявление",
  "Change it": "Изменить его",
  "Start over": "Начать заново",
  "Kind": "Вид",
  "Title": "Заголовок",
  "Body": "Текст",
  "A link, if there is one": "Ссылка, если есть",
  "It ends": "Заканчивается",
  "On the pages the moment it is saved": "На страницах сразу после сохранения",
  "Save the change": "Сохранить изменение",
  "Post it": "Опубликовать",
  "It is on the pages now.": "Теперь оно на страницах.",
  "It was not saved. The title needs three letters at least, and the dates need to be dates.": "Не сохранилось. В заголовке нужно хотя бы три буквы, а даты должны быть датами.",
  "<0/> in all": "всего: <0/>",
  "Nothing is posted. The pages show no strip until there is something true to say.": "Ничего не опубликовано. Полосы на страницах не будет, пока не появится что сказать.",
  "from <0/>": "с <0/>",
  "until <0/>": "до <0/>",
  "on the pages": "на страницах",
  "retired": "снято",
  "Change": "Изменить",
  "Retire": "Снять",

  // admin/views/Chat.tsx
  "Delete it for good? The visitor is not told.": "Удалить навсегда? Посетитель об этом не узнает.",
  "Threads": "Беседы",
  "Nothing has come in yet. The brain in the corner of every page is where it starts.": "Пока ничего не пришло. Начинается всё с мозга в углу каждой страницы.",
  "new": "новое",
  "by mail too": "и по почте",
  "No message yet.": "Сообщений пока нет.",
  "The thread": "Беседа",
  "Choose a thread on the left.": "Выберите беседу слева.",
  "Delete the thread": "Удалить беседу",
  "the visitor": "посетитель",
  "Write the reply here. It is sent as written, in the language you write it.": "Напишите ответ здесь. Он уходит как написан, на том языке, на котором вы его написали.",
  "Your reply": "Ваш ответ",
  "Sending…": "Отправка…",
  "Send the reply": "Отправить ответ",
  "Sent.": "Отправлено.",
  "It was not sent. Try once more.": "Не отправилось. Попробуйте ещё раз.",
  "Copy the address": "Скопировать адрес",
  "Copied": "Скопировано",

  // admin/views/Errors.tsx
  "on <0/>": "на <0/>",
  "on a page that was not named": "на странице, которая не названа",
  "first <0/>": "впервые <0/>",
  "last <0/>": "недавно <0/>",
  "The stack": "Стек",
  "<0/> times": "<0/> раз",
  "Resolve": "Решено",
  "solved": "решено",
  "<0/> open": "открыто: <0/>",
  "<0/> solved": "решено: <0/>",
  "Resolve all": "Решить все",
  "A page of the site that throws reports it here: three times per page load at most, one line per message, thirty reports an hour from one address.": "Страница сайта, на которой что-то сломалось, сообщает сюда: не больше трёх раз за загрузку, одна строка на сообщение, тридцать сообщений в час с одного адреса.",
  "Nothing has been reported. Either the pages hold, or nobody has opened them.": "Ни одного сообщения. Либо страницы держатся, либо их ещё никто не открывал.",
  "Solved": "Решённые",
  "Copy the report": "Скопировать отчёт",

  // admin/views/Launches.tsx
  "The draft": "Черновик",
  "A new draft": "Новый черновик",
  "Channel": "Канал",
  "Text": "Текст",
  "<0/> characters": "<0/> знаков",
  "Keep the draft": "Сохранить черновик",
  "Kept.": "Сохранено.",
  "It was not kept. Try once more.": "Не сохранилось. Попробуйте ещё раз.",
  "Drafts": "Черновики",
  "Nothing kept yet. The first one is written on the left.": "Черновиков пока нет. Первый пишется слева.",
  "changed <0/>": "изменён <0/>",
  "Untitled": "Без заголовка",
  "Copy the text": "Скопировать текст",

  // admin/views/Login.tsx
  "The server is not answering.": "Сервер не отвечает.",
  "The panel, the chat and the announcements all live on it. Try again in a minute.": "Панель, чат и объявления живут на нём. Попробуйте через минуту.",
  "The operator's panel": "Панель оператора",
  "It opens by a link sent to one address: yours. The link works once and holds for fifteen minutes.": "Она открывается по ссылке, которую отправляют на один адрес — ваш. Ссылка работает один раз и держится пятнадцать минут.",
  "Your address": "Ваш адрес",
  "Send me the link": "Пришлите мне ссылку",
  "If that is the address, the link is on its way.": "Если это тот адрес, ссылка уже в пути.",
  "The server is not answering. Try again in a minute.": "Сервер не отвечает. Попробуйте через минуту.",

  // admin/views/System.tsx
  "Up for": "Работает",
  "since the server was started": "с момента запуска сервера",
  "open on the site's pages": "открыто на страницах сайта",
  "on the pages now": "сейчас на страницах",
  "for the launch": "к запуску",
  "Mail": "Почта",
  "set up": "настроена",
  "not set up": "не настроена",
  "A new message in the chat reaches you by mail. Without mail the badge in this panel is the only sign.": "О новом сообщении в чате вы узнаете из письма. Без почты единственный знак — число на этой панели.",
  "Send yourself a letter": "Отправить себе письмо",
  "A letter is on its way to you.": "Письмо уже в пути к вам.",
  "Set RESEND_API_KEY and EMAIL_FROM on the server first.": "Сначала задайте на сервере RESEND_API_KEY и EMAIL_FROM.",
  "The letter was not sent. The server's log says why.": "Письмо не отправилось. Причина — в журнале сервера.",
  "Everything the server remembers": "Всё, что помнит сервер",
  "The threads, the errors, the announcements and the drafts, in one file. Take one before touching the server.": "Беседы, ошибки, объявления и черновики одним файлом. Возьмите его, прежде чем трогать сервер.",
  "Download it as one file": "Скачать одним файлом",
  "The server": "Сервер",
  "Refresh": "Обновить",
  "Version": "Версия",
  "The site": "Сайт",
  "<0/> waiting": "ждёт: <0/>",

  // admin/when.ts
  "<0/> d <1/> h ago": "<0/> дн <1/> ч назад",
  "<0/> h <1/> min ago": "<0/> ч <1/> мин назад",
  "<0/> min ago": "<0/> мин назад",
  "<0/> d <1/> h": "<0/> дн <1/> ч",
  "<0/> h <1/> min": "<0/> ч <1/> мин",
};

export default ru;
