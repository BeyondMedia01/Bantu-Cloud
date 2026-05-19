import { Hono } from 'hono';
import statutoryRoutes from '../routes/statutory';
import taxBandsRoutes from '../routes/taxBands';
import currencyRatesRoutes from '../routes/currencyRates';
import necTablesRoutes from '../routes/necTables';
import nssaSettingsRoutes from '../routes/nssaSettings';
import statutoryRatesRoutes from '../routes/statutoryRates';
import nssaContributionsRoutes from '../routes/nssaContributions';
import statutoryExportsRoutes from '../routes/statutoryExports';
import bankFilesRoutes from '../routes/bankFiles';
import tradeUnionRatesRoutes from '../routes/tradeUnionRates';

const app = new Hono();
app.route('/', statutoryRoutes);
app.route('/tax-bands', taxBandsRoutes);
app.route('/currency-rates', currencyRatesRoutes);
app.route('/nec-tables', necTablesRoutes);
app.route('/nssa-settings', nssaSettingsRoutes);
app.route('/statutory-rates', statutoryRatesRoutes);
app.route('/nssa-contributions', nssaContributionsRoutes);
app.route('/statutory-exports', statutoryExportsRoutes);
app.route('/bank-files', bankFilesRoutes);
app.route('/trade-union-rates', tradeUnionRatesRoutes);

export default app;
