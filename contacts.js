/*
Решение будет работать с отключенным CORS в браузере или через прокси,
который добавит нужные заголовки.
Сервер API не возвращает заголовки Access-Control-Allow-* 
необходимые для работы с разными источниками такие, как
Access-Control-Allow-Headers: authorization
Access-Control-Allow-Methods: PATCH, GET, POST
Access-Control-Allow-Origin: *

В качестве прокси может быть использован плагин для Хрома 
например, "Allow CORS: Access-Control-Allow-Origin" 
https://chrome.google.com/webstore/detail/allow-cors-access-control/lhobafahddgcelffkeicbaginigeejlf/
или настроенный прокси сервер CORS Anywhere на heroku.com
https://getthekt.com/setup-your-own-cors-proxy-on-heroku/
https://www.youtube.com/watch?v=zoOx1b9iBRk (CORS Anywhere Installation on Heroku)
или ngrok.io
*/

// JWT токен для авторизации в amocrm API
// действителен до 4 февраля, 18:45 МСК
const access_token = 'eyJ0eXAiOiJKV1QiLCJhbGciOiJSUzI1NiIsImp0aSI6IjEwOTE3MmE0MjhkZWIxOTMxNDk0NWEzNjI1OGYwNjJkNGQwZGM2ZjIyZjY3MzE4Yzk4OGNkMDEyMzIwZjJmMTZkZWE2NTgwMTJmOGMzZGViIn0.eyJhdWQiOiIzNGUwZGU4Zi0wODE0LTRlNzUtODgzZC00MjkzODg5MDljMTkiLCJqdGkiOiIxMDkxNzJhNDI4ZGViMTkzMTQ5NDVhMzYyNThmMDYyZDRkMGRjNmYyMmY2NzMxOGM5ODhjZDAxMjMyMGYyZjE2ZGVhNjU4MDEyZjhjM2RlYiIsImlhdCI6MTY0MzkwMzI5NiwibmJmIjoxNjQzOTAzMjk2LCJleHAiOjE2NDM5ODk2OTYsInN1YiI6Ijc4NzA4NjciLCJhY2NvdW50X2lkIjoyOTk3NDU3Mywic2NvcGVzIjpbInB1c2hfbm90aWZpY2F0aW9ucyIsImNybSIsIm5vdGlmaWNhdGlvbnMiXX0.faU-xDd6ZM9t8YUA2WUqOFW-63wy97QotimNhIWnX3CH7rIwF_fts5RV8vA7qxdCQ7ciWh4GJ01pJ1jhAA0U68zGET3j6mH9HSx8EDGJiGiexfGaqx3I59x72yEb5CafDvpm56wczD0m5Rog9yfdNhDbnGWI4LERrKLcHkBLTKTBa8Gw0LRbkI_8hwou7Nss_pcseMwXPiPENBN2cGMbesPRmsg9aejTh0fNCmoEA1lwgjSyUYG_zGwIKXGeQ5ZUmbbSut5DN4TpU0feUppY7sbjpjmNdtKCTDZGqkLnjjWWtcSwR8b3vfTzjyblSPa2gHjHLJLw5C_Teylao-71zA';

// название задачи
const taskName = 'Контакт без сделок';

// API хост
const hostAddr = 'https://farkhad.amocrm.ru';

// адрес API для пакетного создания задач
const tasksCreateUrl = '/api/v4/tasks';

// кол-во возвращаемых записей контактов
// рекомендуется не больше 50
const limit = 25;

// номер страницы с контактами
let page = 1;

// адрес API для работы с контактами
// необходимо явно указать по какому полю сортировать (например, ?order[id]=asc)
// чтобы сервер возвращал уникальный набор контактов для указанного page & limit
// опытным путем для 108 контактов было установлено, что без явного
// указания поля сортировки сервер возвращает неуникальный набор для page & limit
// для разных страниц с одинаковым лимитом сервер может вернуть выборку, 
// содержащую контакты, которые присутствовали в выборке на другой странице
let getContactsListQueryUrl = '/api/v4/contacts?order[id]=asc';

// Адрес API задач для поиска задач, связанных с контактами 
// - с привязанным контактом (entity_type=contacts&entity_id[]=xxx)
// - типом задачи: звонок (1)
// - статусом задачи: к выполнению (незавершенные)
// Если такие задачи не найдены, будет возвращена пустая строка String(0)
// Если будут найдены связанные задачи с текстом "Контакт без сделок", то
// создавать новую задачу "Контакт без сделок" для данного контакта не надо
// Пример ответа: https://www.amocrm.ru/developers/content/crm_platform/tasks-api
let tasksContactsQueryUrl = '/api/v4/tasks?filter[task_type]=1&filter[is_completed]=0&filter[entity_type]=contacts';

// Метаданные ключевых функций для кросс-доменных AJAX-запросов
let ajaxCrossDomainCallers = {
  // Получение списка контактов для данных page & limit
  getContacts: {
    url: getContactsListQueryUrl,
    method: 'GET',
    
    // callback ф-ия обработки данных при успешном запросе
    done: getContactsDone,

    // callback ф-ия обработки ошибки при запросе
    fail: getContactsFail
  },

  // Обработка полученного списка контактов с данных page & limit
  // Проверка существующих связанных задач для контактов без сделок
  parseContacts: {
    url: tasksContactsQueryUrl,
    method: 'GET',
    done: parseContactsDone,
    fail: parseContactsFail
  },

  // Пакетное создание задач связанных с контактами без сделок
  createTasksWithContacts: {
    url: tasksCreateUrl,
    method: 'POST',
    done: createTasksWithContactsDone,
    fail: createTasksWithContactsFail
  }
};

// Создание кросс-доменных AJAX-запросов для ключевых функций
function ajaxCrossDomainCall(callerName, ajaxData) {
  if (callerName in ajaxCrossDomainCallers) {
    let ajaxCaller = ajaxCrossDomainCallers[callerName];
    let doneFn = ajaxCaller.done;
    let failFn = ajaxCaller.fail;

    if (typeof ajaxData !== 'string' && 'filter[entity_id]' in ajaxData) {
      // если передан массив контактов для фильтра
      // передадим его в функцию обработки успешного запроса
      doneFn = function(data) {
        ajaxCaller.done(data, ajaxData['filter[entity_id]']);
      }
    }

    $.ajax({
      crossDomain: true,
      url: hostAddr + ajaxCaller.url,
      method: ajaxCaller.method,
      data: ajaxData,
      dataType: 'json',
      headers: {
        Authorization: 'Bearer ' + access_token
      }
    }).done(doneFn).fail(failFn);
  }
}

// Получение списка контактов без сделок 
// на странице page с лимитом записей limit
// и последующая обработка этого списка из callback ф-ии
function getContacts() {
  ajaxCrossDomainCall('getContacts', {
    limit: limit,
    page: page,
    with: 'leads'
  });

  page++;
}

// Обработка поступивших данных о контактах в функции getContacts
// Вызывается в случае успешной обработки запроса
function getContactsDone(data) {
  if (!!data) {
    // Обработка полученного массива контактов
    // - поиск связанных задач
    // - создание задач для контактов без сделок
    parseContacts(data._embedded.contacts);

    // Продолжаем искать контакты на другой странице
    // Переменная page будет увеличена на единицу к этому моменту 
    getContacts();
  } else {
    console.log('Контактов нет');
    return false;
  }
}

// Обработка ошибки при попытке получить данные о контактах
// в функции getContacts
function getContactsFail(data) {
  console.log('Что-то пошло не так c получением контактов', data);
  return false;
}

// Обработка массива контактов
// 1. Определяем массив контактов без сделок на основе
//    полученного набора контактов
// 2. Проверяем, есть ли связанные задачи с указанным названием taskName
// 3. Пакетно создаем задачи для отобранных контактов без сделок
function parseContacts(contacts) {
  // массив ID контаков без сделок
  let contactsWithoutLeads = getContactsWithoutLeads(contacts);

  // проверяем нашлись ли контакты без сделок
  if (!contactsWithoutLeads.length) {
    return false;
  }

  // проверяем, есть ли у найденных контактов связанные задачи
  // не указываем limit, page, т.к. оперируем уже ограниченным набором ID контактов
  ajaxCrossDomainCall('parseContacts', {
    // jQuery автоматически переведет массив ID 
    // в правильную форму query_string
    'filter[entity_id]': contactsWithoutLeads
  });
}

// Обработка поступивших данных о связанных задачах (если такие были найдены)
function parseContactsDone(data, contactsWithoutLeads) {
  if (!!data) {
    // нашли связанные с массивом контактов существующие задачи
    data._embedded.tasks.forEach(task => {
      // Если задача с заданным названием taskName существует,
      // то новую задачу для этого контакта не создаем
      if (task.text === taskName) {
        // Удаляем ID контакта из массива контактов, 
        // чтобы не создавать задачу для него
        let contactIdx = contactsWithoutLeads.indexOf(task.entity_id);
        if (contactIdx > -1) {
          // удаляем найденный элемент из массива контактов
          contactsWithoutLeads.splice(contactIdx, 1);
        }
      }
    });
  }
  // создаем задачи для отобранных контактов
  createTasksWithContacts(contactsWithoutLeads);
}

// Обработка ошибки при попытке получить данные о связанных задачах
function parseContactsFail(data) {
  console.log('Что-то пошло не так с поиском связанных задач', data);
  return false;
}

// пакетное создание задач, связанных с контактами
function createTasksWithContacts(contactsWithoutLeads) {
  // получить массив задач для создания
  let tasksToCreate = getTasksToCreate(contactsWithoutLeads);

  if (!tasksToCreate.length) {
    // задач для создания нет
    return false;
  }

  // создаем задачи для контактов
  ajaxCrossDomainCall('createTasksWithContacts', '[' + tasksToCreate.join(",") + ']');
}

// Обработка успешного запроса на пакетное создание задач
// связанных с контактами без сделок
function createTasksWithContactsDone(data) {
  console.log('Новые задачи были созданы', data);
}

// Обработка ошибки при попытки пакетного создания задач
// связанных с контактами без сделок
function createTasksWithContactsFail(data) {
  console.log('Что-то пошло не так с попыткой создать новые задачи', data);
  return false;
}

// Получить массив ID контактов без сделок
function getContactsWithoutLeads(contacts) {
  // локальный массив контаков без сделок
  let contactsWithoutLeads = [];

  contacts.forEach(contact => {
    // Ищем контакт без сделок (= нет привязанной сущности leads)
    if (!contact._embedded.leads.length) {
      // Контакт без сделок
      // Сохраняем контакт в массиве контактов без сделок
      contactsWithoutLeads.push(contact.id);
    }
  });

  return contactsWithoutLeads;
}

// Получить массив задач для создания
function getTasksToCreate(contactsWithoutLeads) {
  // API позволяет создать задачи пакетно,
  // подготовим массив новых задач
  let tasksToCreate = [];

  // дата завершения задачи в формате unix timestamp
  // срок завершения = через 7 суток
  let completeTillUnixTimestamp = Math.floor(Date.now() / 1000 + 7 * 86400);
  
  // заполним массив новых задач
  contactsWithoutLeads.forEach(contactID => {
    tasksToCreate.push(
      JSON.stringify({
        entity_id: contactID,
        entity_type: 'contacts',
        text: taskName,
        complete_till: completeTillUnixTimestamp,
        task_type_id: 1
      })
    );
  });
  
  return tasksToCreate;
}

$(document).ready(function(){
  $('#create-tasks').click(function() {
    $(this).attr('disabled', true);
    getContacts();
  });
});
