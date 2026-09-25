'use client';

import { useMemo, useState, type FormEvent } from 'react';

type BillingPeriod = 'month' | 'year';
type BookingStep = 1 | 2 | 3 | 4;
type AppointmentStatus = 'booked' | 'confirmed' | 'progress' | 'done' | 'cancelled';

const masters = ['Анна', 'Мира', 'София', 'Лея'];
const services = [
  { name: 'Стрижка и уход', price: 4200, duration: 75 },
  { name: 'Окрашивание Airtouch', price: 14800, duration: 180 },
  { name: 'Маникюр Lux', price: 3600, duration: 90 },
];
const appointments = [
  { client: 'Мария К.', service: 'Airtouch', master: 'Анна', start: 9, span: 4, status: 'confirmed' as AppointmentStatus, price: '14 800 ₽' },
  { client: 'Елена П.', service: 'Маникюр', master: 'Мира', start: 10, span: 2, status: 'progress' as AppointmentStatus, price: '3 600 ₽' },
  { client: 'Ольга С.', service: 'Укладка', master: 'София', start: 12, span: 2, status: 'booked' as AppointmentStatus, price: '4 200 ₽' },
  { client: 'Дарья Н.', service: 'Брови', master: 'Лея', start: 15, span: 1, status: 'done' as AppointmentStatus, price: '2 100 ₽' },
  { client: 'Ирина В.', service: 'Тонирование', master: 'Анна', start: 16, span: 2, status: 'cancelled' as AppointmentStatus, price: '6 400 ₽' },
];
const tenants = [
  { salon: 'Bloom Room', owner: 'Вера Л.', plan: 'Pro', mrr: '7 900 ₽', load: '86%', risk: 'low', status: 'Активен' },
  { salon: 'Cutline Barbers', owner: 'Роман П.', plan: 'Business', mrr: '14 900 ₽', load: '74%', risk: 'low', status: 'Активен' },
  { salon: 'Nail Loft', owner: 'Алина М.', plan: 'Pro', mrr: '7 900 ₽', load: '91%', risk: 'medium', status: 'Trial' },
  { salon: 'Skin Atelier', owner: 'Мария К.', plan: 'Start', mrr: '3 900 ₽', load: '43%', risk: 'high', status: 'Past due' },
];
const securityEvents = [
  { event: 'HTTP flood mitigated', source: 'Cloudflare WAF', count: '18 420', level: 'high' },
  { event: 'Rate limit /api/auth/login', source: 'Edge rule', count: '312', level: 'medium' },
  { event: 'Suspicious tenant export', source: 'Audit log', count: '1', level: 'medium' },
  { event: 'Bot score < 15 blocked', source: 'Bot Fight Mode', count: '4 871', level: 'low' },
];
const statusLabels: Record<AppointmentStatus, string> = {
  booked: 'Забронировано',
  confirmed: 'Подтверждено',
  progress: 'В процессе',
  done: 'Завершено',
  cancelled: 'Отменено',
};

export default function Page() {
  const [mastersCount, setMastersCount] = useState(7);
  const [averageCheck, setAverageCheck] = useState(5200);
  const [period, setPeriod] = useState<BillingPeriod>('year');
  const [bookingStep, setBookingStep] = useState<BookingStep>(1);
  const [selectedService, setSelectedService] = useState(services[1]);
  const [selectedMaster, setSelectedMaster] = useState('Любой свободный');
  const [selectedSlot, setSelectedSlot] = useState('Чт, 18:30');
  const [calendarView, setCalendarView] = useState<'day' | 'week'>('day');
  const [attackMode, setAttackMode] = useState(false);
  const [appointmentOpen, setAppointmentOpen] = useState(false);
  const [billingOpen, setBillingOpen] = useState(false);

  const roi = useMemo(() => {
    const savedHours = mastersCount * 13;
    const recoveredBookings = Math.round(mastersCount * 9.5);
    const revenue = recoveredBookings * averageCheck;
    return { savedHours, recoveredBookings, revenue };
  }, [averageCheck, mastersCount]);

  return <main>
    <LandingNav />
    <section className="hero section-shell" id="top">
      <div className="hero-copy">
        <p className="eyebrow">BEAUTYFLOW CRM ДЛЯ САЛОНОВ</p>
        <h1>Запись, календарь и деньги салона в одном премиальном интерфейсе.</h1>
        <p className="lead">BeautyFlow помогает администраторам быстро заполнять окна, мастерам видеть свой день, а владельцам управлять выручкой, подпиской и ростом без хаоса в мессенджерах.</p>
        <div className="hero-actions">
          <a className="button primary" href="#booking">Попробовать 14 дней бесплатно</a>
          <a className="button ghost" href="#calendar">Смотреть CRM</a>
        </div>
        <div className="proof-strip" aria-label="Ключевые показатели">
          <span><strong>37%</strong> меньше no-show</span>
          <span><strong>2.4 ч</strong> экономии в день</span>
          <span><strong>98%</strong> записей без звонка</span>
        </div>
      </div>
      <CalendarPreview />
    </section>

    <section className="roi section-shell" id="roi">
      <SectionHeader kicker="Калькулятор окупаемости" title="Покажите владельцу цифры, а не обещания." text="Слайдеры пересчитывают экономию времени и прирост выручки от онлайн-записи, напоминаний и плотного календаря." />
      <div className="roi-grid">
        <div className="panel control-panel">
          <label>Количество мастеров <strong>{mastersCount}</strong><input type="range" min="2" max="24" value={mastersCount} onChange={event => setMastersCount(Number(event.target.value))} /></label>
          <label>Средний чек <strong>{averageCheck.toLocaleString('ru-RU')} ₽</strong><input type="range" min="1800" max="18000" step="200" value={averageCheck} onChange={event => setAverageCheck(Number(event.target.value))} /></label>
        </div>
        <div className="roi-result">
          <Metric label="Экономия времени" value={`${roi.savedHours} ч/мес`} />
          <Metric label="Возвращено записей" value={`${roi.recoveredBookings}`} />
          <Metric label="Потенциал выручки" value={`${roi.revenue.toLocaleString('ru-RU')} ₽`} />
        </div>
      </div>
    </section>

    <section className="pricing section-shell" id="pricing">
      <SectionHeader kicker="Тарифы" title="Платите за размер команды, не за сложность." text="Годовой период включает скидку 20%. Популярный план выделен для салонов, которые уже работают с командой." />
      <div className="billing-toggle" role="group" aria-label="Период оплаты">
        <button className={period === 'month' ? 'active' : ''} onClick={() => setPeriod('month')}>Месяц</button>
        <button className={period === 'year' ? 'active' : ''} onClick={() => setPeriod('year')}>Год -20%</button>
      </div>
      <div className="price-grid">
        <PriceCard title="Start" price={3900} period={period} features={['До 3 мастеров', 'Онлайн-запись', 'SMS напоминания']} />
        <PriceCard title="Pro" price={7900} period={period} popular features={['До 12 мастеров', 'Календарь day/week', 'Финансы и no-show', 'Реферальная программа']} />
        <PriceCard title="Business" price={14900} period={period} features={['До 40 мастеров', 'Филиалы', 'Роли и доступы', 'Приоритетная поддержка']} />
      </div>
    </section>

    <section className="booking section-shell" id="booking">
      <SectionHeader kicker="Публичный виджет" title="Mobile-first запись клиента без звонка администратору." text="Виджет можно встроить на сайт салона, отправить ссылкой в Instagram или открыть из QR-кода на ресепшене." />
      <div className="booking-layout">
        <BookingPhone step={bookingStep} selectedService={selectedService} selectedMaster={selectedMaster} selectedSlot={selectedSlot} setSelectedService={setSelectedService} setSelectedMaster={setSelectedMaster} setSelectedSlot={setSelectedSlot} />
        <div className="booking-copy panel">
          {[1, 2, 3, 4].map(step => <button key={step} className={`step-row ${bookingStep === step ? 'active' : ''}`} onClick={() => setBookingStep(step as BookingStep)}><span>0{step}</span>{['Филиал и услуга', 'Мастер', 'Дата и слот', 'Контакты и код'][step - 1]}</button>)}
          <p className="muted">Шаги сохраняют контекст: выбранная услуга влияет на длительность слотов, мастер фильтрует доступность, а финальная форма готова к SMS/WhatsApp подтверждению.</p>
        </div>
      </div>
    </section>

    <section className="calendar-section section-shell" id="calendar">
      <SectionHeader kicker="Рабочий календарь CRM" title="Сетка администратора, где сразу видно загрузку, окна и конфликтные записи." text="Day/Week переключение, колонки мастеров, статусы цветом, быстрое создание записи по нажатию на слот." />
      <div className="calendar-toolbar panel">
        <div><p className="eyebrow">Сегодня, 25 сентября</p><h3>Салон Bloom Room</h3></div>
        <div className="segmented"><button className={calendarView === 'day' ? 'active' : ''} onClick={() => setCalendarView('day')}>Day</button><button className={calendarView === 'week' ? 'active' : ''} onClick={() => setCalendarView('week')}>Week</button></div>
      </div>
      <CalendarBoard view={calendarView} openModal={() => setAppointmentOpen(true)} />
    </section>

    <section className="owner section-shell" id="owner">
      <SectionHeader kicker="Кабинет владельца" title="Выручка, загрузка, подписка и рефералы в одном управленческом экране." text="Блоки показывают состояние бизнеса за день и управление SaaS-подпиской с proration-подтверждением." />
      <div className="kpi-grid">
        <Metric label="Выручка сегодня" value="284 900 ₽" delta="+18% к прошлой пятнице" />
        <Metric label="Загрузка мастеров" value="86%" delta="6 окон доступны" />
        <Metric label="Новые клиенты" value="24" delta="9 из виджета" />
        <Metric label="No-show rate" value="3.8%" delta="-1.4 п.п." />
      </div>
      <div className="owner-grid">
        <div className="panel subscription-panel">
          <p className="eyebrow">ТЕКУЩИЙ ТАРИФ</p>
          <div className="plan-title"><h3>Про</h3><span className="badge success">Активна</span></div>
          <p className="plan-price">7 900 ₽ <span>/ месяц</span></p>
          <div className="details-grid"><span>Следующее списание</span><strong>12 октября 2026</strong><span>Команда</span><strong>9 из 12 мастеров</strong></div>
          <button className="button primary" onClick={() => setBillingOpen(true)}>Сменить тариф</button>
        </div>
        <div className="panel invoices-panel">
          <div className="panel-head"><h3>История платежей</h3><button>Обновить</button></div>
          {['BF-1048', 'BF-1021', 'BF-0994'].map((invoice, index) => <div className="invoice-row" key={invoice}><span>{invoice}</span><strong>{index === 0 ? '7 900 ₽' : '6 320 ₽'}</strong><a href="#top">PDF</a></div>)}
        </div>
        <div className="panel referral-card">
          <p className="eyebrow">РЕФЕРАЛЬНЫЙ БЛОК</p>
          <h3>12 400 ₽ бонусами</h3>
          <label>Ваша ссылка<input readOnly value="beautyflow.ru/r/bloom-room" /></label>
          <div className="hero-actions"><button className="button dark">Вывести</button><button className="button ghost">Оплатить подписку</button></div>
        </div>
      </div>
    </section>

    <section className="social section-shell" id="faq">
      <SectionHeader kicker="Social proof & FAQ" title="Салоны переходят, потому что BeautyFlow не ломает привычный день." text="Отзывы владельцев и короткие ответы на вопросы перед стартом." />
      <div className="social-grid">
        {['Администратор закрывает запись в 2 раза быстрее, а я впервые вижу no-show по мастерам.', 'Виджет окупился за первую неделю: клиенты записываются вечером, когда салон уже закрыт.', 'Наконец тариф и счета лежат там же, где ежедневные показатели бизнеса.'].map((quote, index) => <blockquote className="panel" key={quote}>{quote}<cite>{['Алина, сеть Nail Loft', 'Роман, барбершоп Cutline', 'Вера, салон Bloom Room'][index]}</cite></blockquote>)}
      </div>
      <div className="faq-list">
        {['Можно ли встроить виджет на Tilda?', 'Как работает подтверждение записи?', 'Есть ли разграничение ролей?', 'Что происходит при смене тарифа?'].map((question, index) => <details key={question} className="panel"><summary>{question}</summary><p>{['Да. Виджет встраивается скриптом или открывается отдельной публичной ссылкой.', 'Клиент получает код в SMS или WhatsApp, администратор видит статус подтверждения в календаре.', 'Да. Владелец, администратор и мастер получают разные наборы доступов.', 'Система показывает proration: доплату или перерасчет до следующего списания.'][index]}</p></details>)}
      </div>
    </section>

    <section className="superadmin section-shell" id="superadmin">
      <SectionHeader kicker="Шаг 4 · Суперадмин" title="Операционный центр платформы: tenants, деньги, инциденты и защита на edge." text="Экран для внутренней команды BeautyFlow: видеть здоровье SaaS, быстро разбирать риски, управлять доступом и держать Cloudflare/DDoS под контролем." />
      <div className="admin-shell panel">
        <aside className="admin-rail" aria-label="Навигация суперадмина">
          {['Overview', 'Tenants', 'Billing', 'Security', 'Cloudflare'].map((item, index) => <button className={index === 0 ? 'active' : ''} key={item}>{item}</button>)}
        </aside>
        <div className="admin-main">
          <div className="admin-topline">
            <div><p className="eyebrow">PLATFORM COMMAND CENTER</p><h3>BeautyFlow Control Plane</h3></div>
            <span className="badge success">99.98% uptime</span>
          </div>
          <div className="admin-kpis">
            <Metric label="MRR платформы" value="4.82 млн ₽" delta="+12.6% MoM" />
            <Metric label="Активные tenants" value="612" delta="38 trial" />
            <Metric label="API p95" value="184 ms" delta="edge cache 71%" />
            <Metric label="Blocked threats" value="23.6k" delta="за 24 часа" />
          </div>
          <div className="admin-grid">
            <TenantTable />
            <PlatformAnalytics />
            <SecurityPanel attackMode={attackMode} setAttackMode={setAttackMode} />
          </div>
        </div>
      </div>
    </section>

    <footer className="footer section-shell"><strong>beautyflow</strong><span>Шаг 4 добавлен: суперадмин, аналитика и Cloudflare/DDoS контуры.</span></footer>
    {appointmentOpen && <AppointmentModal close={() => setAppointmentOpen(false)} />}
    {billingOpen && <BillingModal close={() => setBillingOpen(false)} />}
  </main>;
}

function LandingNav() {
  return <header className="nav"><a className="brand" href="#top"><span>b.</span>beautyflow</a><nav><a href="#pricing">Тарифы</a><a href="#booking">Виджет</a><a href="#calendar">Календарь</a><a href="#owner">Кабинет</a><a href="#superadmin">Суперадмин</a></nav><a className="button small" href="#booking">Демо запись</a></header>;
}

function SectionHeader({ kicker, title, text }: { kicker: string; title: string; text: string }) {
  return <div className="section-head"><p className="eyebrow">{kicker}</p><h2>{title}</h2><p>{text}</p></div>;
}

function Metric({ label, value, delta }: { label: string; value: string; delta?: string }) {
  return <div className="metric"><span>{label}</span><strong>{value}</strong>{delta && <small>{delta}</small>}</div>;
}

function CalendarPreview() {
  return <div className="demo-calendar" aria-label="Демо превью календаря"><div className="preview-top"><span>Sep 25</span><strong>Запись салона</strong></div>{masters.slice(0, 3).map((master, index) => <div className="preview-row" key={master}><span>{master}</span><div className={`preview-pill tone-${index}`}>{['09:00 Airtouch', '11:30 Маникюр', '14:00 Укладка'][index]}</div></div>)}<div className="floating-card"><strong>+34 800 ₽</strong><span>выручка подтверждена</span></div></div>;
}

function PriceCard({ title, price, period, popular, features }: { title: string; price: number; period: BillingPeriod; popular?: boolean; features: string[] }) {
  const actualPrice = period === 'year' ? Math.round(price * 0.8) : price;
  return <article className={`price-card panel ${popular ? 'popular' : ''}`}>{popular && <span className="popular-badge">Популярный</span>}<h3>{title}</h3><p className="plan-price">{actualPrice.toLocaleString('ru-RU')} ₽ <span>/ {period === 'month' ? 'мес' : 'мес при оплате за год'}</span></p><ul>{features.map(feature => <li key={feature}>{feature}</li>)}</ul><button className="button primary">Выбрать</button></article>;
}

function BookingPhone({ step, selectedService, selectedMaster, selectedSlot, setSelectedService, setSelectedMaster, setSelectedSlot }: { step: BookingStep; selectedService: typeof services[number]; selectedMaster: string; selectedSlot: string; setSelectedService: (service: typeof services[number]) => void; setSelectedMaster: (master: string) => void; setSelectedSlot: (slot: string) => void }) {
  return <div className="phone"><div className="phone-top"><span>Bloom Room</span><strong>Онлайн-запись</strong></div><div className="progress"><span style={{ width: `${step * 25}%` }} /></div>
    {step === 1 && <div className="phone-screen"><p className="eyebrow">ШАГ 1</p><h3>Выберите услугу</h3><button className="branch active">Центр, Петровка 18</button>{services.map(service => <button key={service.name} className={`service-card ${selectedService.name === service.name ? 'active' : ''}`} onClick={() => setSelectedService(service)}><span>{service.name}</span><strong>{service.price.toLocaleString('ru-RU')} ₽</strong><small>{service.duration} мин</small></button>)}</div>}
    {step === 2 && <div className="phone-screen"><p className="eyebrow">ШАГ 2</p><h3>Мастер</h3>{['Любой свободный', ...masters].map(master => <button key={master} className={`master-card ${selectedMaster === master ? 'active' : ''}`} onClick={() => setSelectedMaster(master)}><span>{master}</span><small>{master === 'Любой свободный' ? 'Самый быстрый слот' : 'Рейтинг 4.9'}</small></button>)}</div>}
    {step === 3 && <div className="phone-screen"><p className="eyebrow">ШАГ 3</p><h3>Дата и время</h3><div className="date-row">{['Вт 23', 'Ср 24', 'Чт 25', 'Пт 26'].map(day => <button key={day} className={day.startsWith('Чт') ? 'active' : ''}>{day}</button>)}</div><div className="slot-grid">{['10:00', '11:30', '15:00', '18:30', '19:15'].map(slot => <button key={slot} className={selectedSlot.includes(slot) ? 'active' : ''} onClick={() => setSelectedSlot(`Чт, ${slot}`)}>{slot}</button>)}</div></div>}
    {step === 4 && <form className="phone-screen" onSubmit={(event: FormEvent) => event.preventDefault()}><p className="eyebrow">ШАГ 4</p><h3>Подтверждение</h3><div className="summary"><span>{selectedService.name}</span><strong>{selectedSlot}</strong><small>{selectedMaster}</small></div><label>Телефон<input placeholder="+7 999 000-00-00" /></label><label>Имя<input placeholder="Анна" /></label><button className="button primary full">Получить код в WhatsApp</button></form>}
  </div>;
}

function CalendarBoard({ view, openModal }: { view: 'day' | 'week'; openModal: () => void }) {
  const hours = [9, 10, 11, 12, 13, 14, 15, 16, 17, 18];
  return <div className={`calendar-board panel ${view}`}><div className="time-column"><span />{hours.map(hour => <span key={hour}>{hour}:00</span>)}</div>{masters.map(master => <div className="master-column" key={master}><div className="master-head">{master}<small>{master === 'Лея' ? 'Кресло 2' : 'Кресло 1'}</small></div>{hours.map(hour => <button className="slot" key={hour} onClick={openModal} aria-label={`Создать запись ${master} ${hour}:00`} />)}{appointments.filter(item => item.master === master).map(item => <button key={`${item.client}-${item.start}`} className={`appointment ${item.status}`} style={{ top: `${46 + (item.start - 9) * 46}px`, height: `${item.span * 46 - 8}px` }} onClick={openModal}><strong>{item.client}</strong><span>{item.service}</span><small>{statusLabels[item.status]} · {item.price}</small></button>)}</div>)}</div>;
}

function AppointmentModal({ close }: { close: () => void }) {
  return <div className="modal-backdrop" role="dialog" aria-modal="true"><form className="modal panel" onSubmit={(event: FormEvent) => { event.preventDefault(); close(); }}><div className="panel-head"><div><p className="eyebrow">БЫСТРАЯ ЗАПИСЬ</p><h3>Создать визит</h3></div><button type="button" onClick={close}>Закрыть</button></div><label>Клиент<input placeholder="Телефон или имя" defaultValue="+7 999 135-22-18" /></label><div className="form-two"><label>Услуги<select defaultValue="airtouch"><option value="airtouch">Airtouch + уход</option><option>Маникюр Lux</option><option>Укладка</option></select></label><label>Оплата<select defaultValue="deposit"><option value="deposit">Предоплата</option><option>На месте</option><option>Долг</option></select></label></div><div className="modal-total"><span>Итого: 14 800 ₽</span><strong>09:00 - 12:00</strong></div><button className="button primary full">Сохранить запись</button></form></div>;
}

function BillingModal({ close }: { close: () => void }) {
  return <div className="modal-backdrop" role="dialog" aria-modal="true"><div className="modal panel"><div className="panel-head"><div><p className="eyebrow">PRORATION</p><h3>Смена тарифа</h3></div><button onClick={close}>Закрыть</button></div><p className="muted">Переход с «Про» на «Бизнес» вступит в силу сразу. Система зачтет остаток текущего периода.</p><div className="details-grid"><span>Доплата сегодня</span><strong>4 210 ₽</strong><span>Новый лимит</span><strong>40 мастеров</strong><span>Следующее списание</span><strong>14 900 ₽, 12 октября</strong></div><button className="button primary full" onClick={close}>Подтвердить смену тарифа</button></div></div>;
}

function TenantTable() {
  return <section className="admin-card tenant-card"><div className="panel-head"><div><p className="eyebrow">TENANT MANAGEMENT</p><h3>Салоны и риск</h3></div><button>Export CSV</button></div><div className="tenant-table">{tenants.map(tenant => <div className="tenant-row" key={tenant.salon}><div><strong>{tenant.salon}</strong><span>{tenant.owner} · {tenant.plan}</span></div><span>{tenant.mrr}</span><span>{tenant.load}</span><span className={`risk ${tenant.risk}`}>{tenant.status}</span><button>Открыть</button></div>)}</div></section>;
}

function PlatformAnalytics() {
  return <section className="admin-card analytics-card"><div className="panel-head"><div><p className="eyebrow">ANALYTICS</p><h3>Воронка и нагрузка</h3></div><button>Live</button></div><div className="chart-bars" aria-label="График MRR и использования">{[58, 66, 62, 74, 81, 77, 88, 94].map((height, index) => <span key={index} style={{ height: `${height}%` }}><i /></span>)}</div><div className="funnel"><div><span>Trial → Paid</span><strong>42%</strong></div><div><span>Churn risk</span><strong>3.1%</strong></div><div><span>Webhook errors</span><strong>0.07%</strong></div></div></section>;
}

function SecurityPanel({ attackMode, setAttackMode }: { attackMode: boolean; setAttackMode: (enabled: boolean) => void }) {
  return <section className="admin-card security-card"><div className="panel-head"><div><p className="eyebrow">SECURITY & CLOUDFLARE</p><h3>DDoS posture</h3></div><button className={attackMode ? 'danger' : ''} onClick={() => setAttackMode(!attackMode)}>{attackMode ? 'Under Attack: ON' : 'Enable Under Attack'}</button></div><div className="shield"><strong>{attackMode ? 'Challenge mode active' : 'Managed rules active'}</strong><span>WAF, bot score, rate limits, geo anomalies, audit trail.</span></div><div className="event-list">{securityEvents.map(event => <div className="event-row" key={event.event}><span className={`severity ${event.level}`} /><div><strong>{event.event}</strong><small>{event.source}</small></div><b>{event.count}</b></div>)}</div></section>;
}
