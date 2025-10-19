import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import session from 'express-session';
import supabase from './db.mjs';
import bcrypt from 'bcryptjs';

dotenv.config();

const app = express();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);


// Journalisation des variables d'environnement pour débogage
console.log('Environment variables:', {
  SUPABASE_URL: process.env.SUPABASE_URL ? 'Set' : 'Missing',
  SESSION_SECRET: process.env.SESSION_SECRET ? 'Set' : 'Missing',
  DATABASE_URL: process.env.DATABASE_URL ? 'Set' : 'Missing'
});

// Middleware
app.use(express.json({ charset: 'utf-8' }));
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, '..', 'public')));
app.use(session({
  secret: process.env.SESSION_SECRET || 'your-secret-key',
  resave: false,
  saveUninitialized: false,
  cookie: { secure: process.env.NODE_ENV === 'production' }
}));

// Utiliser livereload uniquement en développement
if (process.env.NODE_ENV !== 'production') {
  import('livereload').then(livereload => {
    import('connect-livereload').then(connectLivereload => {
      app.use(connectLivereload.default());
      const liveReloadServer = livereload.default.createServer();
      liveReloadServer.watch(path.join(__dirname, '..', 'public'));
      liveReloadServer.server.once('connection', () => {
        setTimeout(() => {
          liveReloadServer.refresh('/');
        }, 100);
      });
    });
  });
}

// Planifier la tâche uniquement hors environnement serverless
if (process.env.NODE_ENV !== 'production') {
  import('node-schedule').then(schedule => {
    schedule.default.scheduleJob('0 0 * * 0', async () => {
      try {
        const { error } = await supabase
          .from('participants')
          .update({ participe: false })
          .eq('participe', true);
        if (error) throw error;
        console.log('Participe column reset to false for all participants');
      } catch (error) {
        console.error('Error resetting participe:', error);
      }
    });
  });
}

// Route racine
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'Priere2.html'));
});

// Endpoint d'inscription
app.post('/register', async (req, res) => {
  const { firstName, lastName, email, phone, password, city, source, message } = req.body;
  
  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    const { data, error } = await supabase
      .from('participants')
      .insert([{ first_name: firstName, last_name: lastName, email, phone, password: hashedPassword, city, source, message, participe: false }]);
    
    if (error) throw error;
    res.status(201).json({ message: 'Inscription réussie !' });
  } catch (error) {
    console.error('Erreur lors de l\'inscription:', error);
    res.status(400).json({ error: error.message || 'Erreur lors de l\'inscription' });
  }
});

// Endpoint de connexion
app.post('/login', async (req, res) => {
  const { email, password } = req.body;
  
  try {
    const { data, error } = await supabase
      .from('participants')
      .select('id, email, first_name, password, participe')
      .eq('email', email)
      .single();
    
    if (error || !data) {
      return res.status(401).json({ error: 'Email ou mot de passe incorrect' });
    }
    
    const isValidPassword = await bcrypt.compare(password, data.password);
    if (!isValidPassword) {
      return res.status(401).json({ error: 'Email ou mot de passe incorrect' });
    }
    
    req.session.userId = data.id;
    res.status(200).json({ message: 'Connexion réussie !', user: { email: data.email, firstName: data.first_name, participe: data.participe || false } });
  } catch (error) {
    console.error('Erreur lors de la connexion:', error);
    res.status(400).json({ error: error.message || 'Erreur lors de la connexion' });
  }
});

// Vérification de session
app.get('/check-session', async (req, res) => {
  console.log('Checking session for userId:', req.session.userId);
  if (req.session.userId) {
    try {
      const { data, error } = await supabase
        .from('participants')
        .select('email, first_name, participe')
        .eq('id', req.session.userId)
        .single();
      if (error) throw error;
      console.log('Session check result:', { isLoggedIn: true, user: { email: data.email, firstName: data.first_name, participe: data.participe || false } });
      res.status(200).json({ isLoggedIn: true, user: { email: data.email, firstName: data.first_name, participe: data.participe || false } });
    } catch (error) {
      console.error('Error checking session:', error);
      res.status(200).json({ isLoggedIn: false });
    }
  } else {
    console.log('No session found');
    res.status(200).json({ isLoggedIn: false });
  }
});

// Endpoint des réservations
app.get('/reservations', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('participants')
      .select('first_name, last_name, phone, created_at')
      .eq('participe', true);
    if (error) throw error;
    res.status(200).json(data);
  } catch (error) {
    console.error('Error fetching reservations:', error);
    res.status(500).json({ error: 'Erreur lors de la récupération des réservations' });
  }
});

// Endpoint de réservation
app.post('/reserve', async (req, res) => {
  if (!req.session.userId) {
    return res.status(401).json({ error: 'Vous devez être connecté pour réserver' });
  }
  
  try {
    const { error } = await supabase
      .from('participants')
      .update({ participe: true })
      .eq('id', req.session.userId);
    
    if (error) throw error;
    res.status(200).json({ message: 'Réservation confirmée !' });
  } catch (error) {
    console.error('Erreur lors de la réservation:', error);
    res.status(400).json({ error: error.message || 'Erreur lors de la réservation' });
  }
});

// Endpoint d'annulation de réservation
app.post('/cancel-reservation', async (req, res) => {
  if (!req.session.userId) {
    return res.status(401).json({ error: 'Vous devez être connecté pour annuler une réservation' });
  }
  
  try {
    const { error } = await supabase
      .from('participants')
      .update({ participe: false })
      .eq('id', req.session.userId);
    
    if (error) throw error;
    res.status(200).json({ message: 'Réservation annulée !' });
  } catch (error) {
    console.error('Erreur lors de l\'annulation de la réservation:', error);
    res.status(400).json({ error: error.message || 'Erreur lors de l\'annulation de la réservation' });
  }
});

// Endpoint de déconnexion
app.post('/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      console.error('Error destroying session:', err);
      return res.status(500).json({ error: 'Erreur lors de la déconnexion' });
    }
    res.status(200).json({ message: 'Déconnexion réussie' });
  });
});

// Test de connexion Supabase
app.get('/test-db', async (req, res) => {
  try {
    const { data, error } = await supabase.from('participants').select('id').limit(1);
    if (error) throw error;
    res.status(200).json({ message: 'Connexion à la base de données réussie', data });
  } catch (error) {
    res.status(500).json({ error: 'Échec de la connexion à la base de données', details: error.message });
  }
});

// Écoute locale uniquement en développement
// if (process.env.NODE_ENV !== 'production') {
//   const PORT = process.env.PORT || 3000;
//   app.listen(PORT, () => {
//     console.log(`✅ Serveur démarré sur http://localhost:${PORT}`);
//   });
// }

export default app;