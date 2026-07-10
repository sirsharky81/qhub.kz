import type { Metadata } from "next";
import Link from "next/link";
import ServicePageHeader from "@/components/ServicePageHeader";

export const metadata: Metadata = {
  title: "Политика конфиденциальности — QHub.kz",
  description:
    "Политика конфиденциальности платформы QHub.kz: какие данные мы собираем, зачем и как их защищаем.",
  alternates: {
    canonical: "https://qhub.kz/privacy",
  },
};

const LAST_UPDATED = "10 июля 2026 г.";
const CONTACT_EMAIL = "qhub.kz@proton.me";

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3">
      <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
      <div className="space-y-3 text-sm text-gray-600 leading-relaxed">{children}</div>
    </section>
  );
}

export default function PrivacyPage() {
  return (
    <div className="flex flex-col min-h-screen bg-white text-gray-900">
      <ServicePageHeader
        trailing={
          <Link
            href="/"
            className="text-xs text-gray-400 hover:text-gray-700 transition-colors"
          >
            ← На главную
          </Link>
        }
      >
        <span className="text-gray-300 select-none shrink-0">/</span>
        <span className="text-xs sm:text-sm font-medium text-gray-800">
          Политика конфиденциальности
        </span>
      </ServicePageHeader>

      <main className="flex-1 px-4 sm:px-6 py-12 sm:py-16">
        <article className="max-w-3xl mx-auto space-y-10">
          <header className="space-y-3 border-b border-gray-100 pb-8">
            <p className="text-xs uppercase tracking-widest text-gray-400 font-mono">
              Правовая информация
            </p>
            <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-gray-900">
              Политика конфиденциальности
            </h1>
            <p className="text-sm text-gray-500">
              Дата последнего обновления: {LAST_UPDATED}
            </p>
            <p className="text-sm text-gray-600 leading-relaxed">
              Настоящая политика описывает, как платформа{" "}
              <strong className="font-medium text-gray-800">QHub.kz</strong>{" "}
              (веб-сайт{" "}
              <a
                href="https://qhub.kz"
                className="text-gray-800 underline underline-offset-2 hover:text-gray-600"
              >
                qhub.kz
              </a>
              , мобильное приложение для Android с идентификатором пакета{" "}
              <code className="text-xs bg-gray-100 px-1.5 py-0.5 rounded font-mono">
                kz.qhub.app
              </code>
              ) обрабатывает персональные и технические данные пользователей.
            </p>
            <p className="text-sm text-gray-700 leading-relaxed rounded-xl border border-gray-200 bg-gray-50 px-4 py-3">
              <strong className="font-medium text-gray-900">Главный принцип:</strong>{" "}
              мы по возможности{" "}
              <strong className="font-medium text-gray-800">не храним</strong>{" "}
              ваши данные. Большинство инструментов работают на устройстве и не
              отправляют содержимое на сервер. Если хранение всё же необходимо
              для работы сервиса, данные помещаются в{" "}
              <strong className="font-medium text-gray-800">
                зашифрованном виде
              </strong>{" "}
              — ключи остаются у вас, и содержимое недоступно даже разработчикам
              QHub.
            </p>
          </header>

          <Section title="1. Оператор данных">
            <p>
              Оператором сервиса QHub.kz является команда проекта QHub.kz,
              Республика Казахстан.
            </p>
            <p>
              По вопросам конфиденциальности и обработки данных:{" "}
              <a
                href={`mailto:${CONTACT_EMAIL}`}
                className="text-gray-800 underline underline-offset-2 hover:text-gray-600"
              >
                {CONTACT_EMAIL}
              </a>
            </p>
          </Section>

          <Section title="2. Какие данные мы обрабатываем">
            <p>
              Мы обрабатываем только то, без чего нельзя предоставить выбранную
              вами функцию. Во всём остальном данные остаются на вашем
              устройстве.
            </p>
            <p>В зависимости от используемых функций это может включать:</p>
            <ul className="list-disc pl-5 space-y-2">
              <li>
                <strong className="font-medium text-gray-800">
                  Данные аккаунта
                </strong>{" "}
                — номер телефона, имя профиля, аватар (в мессенджере и
                связанных сервисах). Хранятся в минимально необходимом объёме.
              </li>
              <li>
                <strong className="font-medium text-gray-800">
                  Сообщения и файлы
                </strong>{" "}
                — текст, вложения и медиа в мессенджере QHub. Содержимое
                шифруется на устройстве до отправки. На сервере, если данные и
                проходят через него, они хранятся{" "}
                <strong className="font-medium text-gray-800">
                  только в зашифрованном виде
                </strong>
                ; расшифровать их могут только участники переписки, а не
                разработчики QHub.
              </li>
              <li>
                <strong className="font-medium text-gray-800">
                  Геолокация
                </strong>{" "}
                — точные координаты при использовании семейного трекера и
                связанных функций безопасности, в том числе в фоновом режиме
                на мобильных устройствах (с вашего явного разрешения).
                Используется только для запрошенной функции, без продажи и
                профилирования.
              </li>
              <li>
                <strong className="font-medium text-gray-800">
                  Данные с камеры и микрофона
                </strong>{" "}
                — при использовании сканера документов, QR-сканера, фото на
                паспорт, гитарного тюнера, голосовых и видеозвонков в
                мессенджере. В большинстве инструментов обработка идёт
                локально; поток не сохраняется на сервере без вашего действия.
              </li>
              <li>
                <strong className="font-medium text-gray-800">
                  Push-токен устройства
                </strong>{" "}
                — технический идентификатор для доставки уведомлений (Firebase
                Cloud Messaging), без доступа к содержимому сообщений.
              </li>
              <li>
                <strong className="font-medium text-gray-800">
                  Технические данные
                </strong>{" "}
                — тип устройства, версия ОС, IP-адрес, краткоживущие журналы
                ошибок для стабильности сервиса. Не используются для рекламного
                профилирования.
              </li>
              <li>
                <strong className="font-medium text-gray-800">
                  Данные, вводимые в инструментах
                </strong>{" "}
                — файлы, тексты и параметры в отдельных веб-приложениях
                (калькуляторы, конвертеры, сканеры и др.).{" "}
                <strong className="font-medium text-gray-800">
                  Практически все такие инструменты обрабатывают данные локально
                  в браузере и не отправляют их на сервер.
                </strong>
              </li>
            </ul>
          </Section>

          <Section title="3. Цели обработки">
            <ul className="list-disc pl-5 space-y-2">
              <li>предоставление функций платформы и отдельных приложений;</li>
              <li>аутентификация и управление аккаунтом;</li>
              <li>доставка сообщений, звонков и push-уведомлений;</li>
              <li>
                функции семейной безопасности и отображение местоположения на
                карте;
              </li>
              <li>обеспечение безопасности, предотвращение злоупотреблений;</li>
              <li>улучшение качества и исправление ошибок;</li>
              <li>ответы на обращения пользователей.</li>
            </ul>
          </Section>

          <Section title="4. Правовые основания">
            <p>Мы обрабатываем данные на основании:</p>
            <ul className="list-disc pl-5 space-y-2">
              <li>вашего согласия (например, при включении геолокации, камеры, микрофона или push-уведомлений);</li>
              <li>необходимости исполнения пользовательского соглашения и предоставления запрошенных вами функций;</li>
              <li>законных интересов оператора в обеспечении безопасности и стабильности сервиса.</li>
            </ul>
          </Section>

          <Section title="5. Разрешения мобильного приложения (Android)">
            <p>
              Мобильное приложение QHub может запрашивать следующие разрешения:
            </p>
            <ul className="list-disc pl-5 space-y-2">
              <li>
                <strong className="font-medium text-gray-800">Интернет</strong>{" "}
                — связь с серверами QHub.kz;
              </li>
              <li>
                <strong className="font-medium text-gray-800">Камера</strong> —
                сканирование документов, QR-кодов, фото;
              </li>
              <li>
                <strong className="font-medium text-gray-800">Микрофон</strong>{" "}
                — звонки, гитарный тюнер;
              </li>
              <li>
                <strong className="font-medium text-gray-800">
                  Геолокация
                </strong>{" "}
                — семейный трекер (включая фоновый доступ при явном
                согласии);
              </li>
              <li>
                <strong className="font-medium text-gray-800">
                  Уведомления
                </strong>{" "}
                — входящие сообщения и системные оповещения.
              </li>
            </ul>
            <p>
              Вы можете отозвать разрешения в настройках устройства; при этом
              часть функций может стать недоступной.
            </p>
          </Section>

          <Section title="6. Передача данных третьим лицам">
            <p>
              Мы не продаём персональные данные. Передача возможна только в
              следующих случаях:
            </p>
            <ul className="list-disc pl-5 space-y-2">
              <li>
                <strong className="font-medium text-gray-800">
                  Поставщики инфраструктуры
                </strong>{" "}
                — хостинг, базы данных, доставка push-уведомлений (в том числе
                Google Firebase), при условии соблюдения ими требований
                конфиденциальности;
              </li>
              <li>
                <strong className="font-medium text-gray-800">
                  Требования закона
                </strong>{" "}
                — по законному запросу уполномоченных органов Республики
                Казахстан;
              </li>
              <li>
                <strong className="font-medium text-gray-800">
                  С вашего согласия
                </strong>{" "}
                — в иных случаях, о которых мы сообщим отдельно.
              </li>
            </ul>
          </Section>

          <Section title="7. Хранение и защита">
            <p>
              <strong className="font-medium text-gray-800">
                Мы не строим архитектуру вокруг накопления ваших данных.
              </strong>{" "}
              По умолчанию обработка происходит на устройстве; сервер получает
              лишь то, что нужно для доставки запрошенной функции (например,
              доставить сообщение или показать координату на семейной карте).
            </p>
            <p>
              Если данные всё же сохраняются на серверах QHub.kz, это
              происходит в{" "}
              <strong className="font-medium text-gray-800">
                зашифрованном виде
              </strong>{" "}
              с использованием современных криптографических алгоритмов
              (в том числе AES-GCM). Ключи шифрования создаются и хранятся на
              стороне пользователя;{" "}
              <strong className="font-medium text-gray-800">
                разработчики и администраторы QHub не могут прочитать содержимое
                зашифрованных сообщений и файлов
              </strong>{" "}
              — у нас есть доступ только к техническим метаданным, необходимым
              для работы сервиса (например, факт доставки или идентификатор
              беседы).
            </p>
            <p>
              Передача данных всегда идёт по защищённым каналам (TLS/HTTPS).
              Срок хранения минимален: данные аккаунта — пока аккаунт активен;
              технические журналы — краткое время для диагностики; зашифрованные
              сообщения — только столько, сколько нужно для синхронизации между
              вашими устройствами.
            </p>
            <p>
              Мы принимаем организационные и технические меры для защиты данных,
              однако ни один способ передачи через интернет не гарантирует
              абсолютной безопасности.
            </p>
          </Section>

          <Section title="8. Ваши права">
            <p>Вы вправе:</p>
            <ul className="list-disc pl-5 space-y-2">
              <li>получить информацию об обработке ваших данных;</li>
              <li>исправить неточные данные профиля;</li>
              <li>удалить аккаунт и связанные данные (через настройки приложения или по запросу на {CONTACT_EMAIL});</li>
              <li>отозвать согласие на обработку данных, не влияющую на законность обработки до отзыва;</li>
              <li>ограничить или возразить против определённых видов обработки в пределах, допускаемых законом.</li>
            </ul>
            <p>
              Для реализации прав напишите на{" "}
              <a
                href={`mailto:${CONTACT_EMAIL}`}
                className="text-gray-800 underline underline-offset-2 hover:text-gray-600"
              >
                {CONTACT_EMAIL}
              </a>
              . Мы ответим в разумный срок.
            </p>
          </Section>

          <Section title="9. Дети">
            <p>
              Сервис QHub.kz не предназначен для самостоятельного использования
              детьми младше 13 лет без согласия родителей или законных
              представителей. Функции семейного трекера предполагают участие
              взрослых в настройке и контроле.
            </p>
          </Section>

          <Section title="10. Файлы cookie и локальное хранилище">
            <p>
              Веб-версия может использовать cookie и локальное хранилище
              браузера для сессий, настроек и работы PWA. Вы можете очистить
              их в настройках браузера; это может повлиять на работу отдельных
              функций.
            </p>
          </Section>

          <Section title="11. Изменения политики">
            <p>
              Мы можем обновлять эту политику. Актуальная версия всегда
              доступна по адресу{" "}
              <a
                href="https://qhub.kz/privacy"
                className="text-gray-800 underline underline-offset-2 hover:text-gray-600"
              >
                https://qhub.kz/privacy
              </a>
              . При существенных изменениях мы уведомим пользователей через
              приложение или сайт.
            </p>
          </Section>

          <Section title="12. Контакты">
            <p>
              По всем вопросам, связанным с конфиденциальностью и персональными
              данными:
            </p>
            <p>
              Email:{" "}
              <a
                href={`mailto:${CONTACT_EMAIL}`}
                className="text-gray-800 underline underline-offset-2 hover:text-gray-600"
              >
                {CONTACT_EMAIL}
              </a>
              <br />
              Сайт:{" "}
              <a
                href="https://qhub.kz"
                className="text-gray-800 underline underline-offset-2 hover:text-gray-600"
              >
                https://qhub.kz
              </a>
            </p>
          </Section>

          <footer className="border-t border-gray-100 pt-8 text-xs text-gray-400">
            © {new Date().getFullYear()} QHub.kz — Первый казахский хаб полезных
            приложений. Сделано в Казахстане.
          </footer>
        </article>
      </main>
    </div>
  );
}
