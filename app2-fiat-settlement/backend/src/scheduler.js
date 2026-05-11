const cron = require('node-cron');
const { getAllSchedules, createPayment, confirmPayment } = require('./db');
const { mockSendPayment } = require('./payment');

const activeTasks = new Map();

function startScheduler(db, config) {
  const schedules = getAllSchedules(db).filter((s) => s.active);
  for (const schedule of schedules) {
    registerSchedule(db, config, schedule);
  }
}

function registerSchedule(db, config, schedule) {
  if (activeTasks.has(schedule.id)) return;
  if (!cron.validate(schedule.cron_expr)) {
    console.error(`Invalid cron expression for schedule ${schedule.id}: "${schedule.cron_expr}"`);
    return;
  }

  const task = cron.schedule(schedule.cron_expr, async () => {
    try {
      await runScheduledPayment(db, config, schedule);
    } catch (err) {
      console.error(`Scheduler error for schedule ${schedule.id}:`, err);
    }
  });

  activeTasks.set(schedule.id, task);
}

function unregisterSchedule(id) {
  const task = activeTasks.get(id);
  if (task) {
    task.stop();
    activeTasks.delete(id);
  }
}

function stopAllSchedules() {
  for (const [id, task] of activeTasks) {
    task.stop();
    activeTasks.delete(id);
  }
}

async function runScheduledPayment(db, config, schedule) {
  await mockSendPayment({ amount: schedule.amount, currency: schedule.currency });

  const payment = createPayment(db, {
    school_id: schedule.school_id,
    amount: schedule.amount,
    currency: schedule.currency,
  });

  confirmPayment(db, payment.id, { app1_released: false });
  return payment;
}

module.exports = { startScheduler, registerSchedule, unregisterSchedule, stopAllSchedules, runScheduledPayment };
