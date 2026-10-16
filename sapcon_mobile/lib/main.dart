import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:file_picker/file_picker.dart';
import 'package:url_launcher/url_launcher.dart';
import 'package:video_player/video_player.dart';
import 'theme.dart';
import 'api_service.dart';

void main() {
  WidgetsFlutterBinding.ensureInitialized();
  SystemChrome.setSystemUIOverlayStyle(
    const SystemUiOverlayStyle(
      statusBarColor: Colors.transparent,
      statusBarIconBrightness: Brightness.dark,
    ),
  );
  runApp(const SapconApp());
}

class SapconApp extends StatelessWidget {
  const SapconApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'SAPCON Sales Workbench',
      debugShowCheckedModeBanner: false,
      theme: AppTheme.lightTheme,
      home: const SplashScreen(),
    );
  }
}

// ──────────────────────────────────────────────
// Screen 1: Splash Screen
// ──────────────────────────────────────────────
class SplashScreen extends StatefulWidget {
  const SplashScreen({super.key});

  @override
  State<SplashScreen> createState() => _SplashScreenState();
}

class _SplashScreenState extends State<SplashScreen> {
  late VideoPlayerController _videoController;
  bool _isVideoInitialized = false;
  bool _hasNavigated = false;
  Map<String, dynamic>? _authResult;

  @override
  void initState() {
    super.initState();
    _startPreloadAndVideo();
  }

  Future<void> _startPreloadAndVideo() async {
    // 1. Asynchronously pre-fetch auth session in parallel while video is playing
    ApiService.getAuthStatus().then((auth) {
      _authResult = auth;
    }).catchError((_) {
      _authResult = {'authenticated': false, 'email': null};
    });

    // 2. Initialize and play the full splash MP4 video
    _videoController = VideoPlayerController.asset('assets/images/flash.mp4');
    try {
      await _videoController.initialize();
      if (!mounted) return;
      setState(() => _isVideoInitialized = true);

      _videoController.setLooping(false);
      _videoController.play();

      _videoController.addListener(() {
        final pos = _videoController.value.position;
        final dur = _videoController.value.duration;
        // When video reaches the end (or is finished playing)
        if (dur > Duration.zero && pos >= dur && !_hasNavigated) {
          _navigateToNextScreen();
        }
      });
    } catch (e) {
      // Fallback in case device video codec has issue: wait 5.5s then navigate
      await Future.delayed(const Duration(milliseconds: 5500));
      if (!_hasNavigated) _navigateToNextScreen();
    }
  }

  void _navigateToNextScreen() {
    if (_hasNavigated || !mounted) return;
    _hasNavigated = true;

    final auth = _authResult ?? {'authenticated': false};
    if (auth['authenticated'] == true) {
      Navigator.pushReplacement(
        context,
        PageRouteBuilder(
          transitionDuration: const Duration(milliseconds: 500),
          pageBuilder: (_, __, ___) => MainNavigationScaffold(
            userEmail: auth['email'] ?? 'raghavtiwari972003@gmail.com',
          ),
          transitionsBuilder: (_, anim, __, child) => FadeTransition(opacity: anim, child: child),
        ),
      );
    } else {
      Navigator.pushReplacement(
        context,
        PageRouteBuilder(
          transitionDuration: const Duration(milliseconds: 500),
          pageBuilder: (_, __, ___) => const OnboardingScreen(),
          transitionsBuilder: (_, anim, __, child) => FadeTransition(opacity: anim, child: child),
        ),
      );
    }
  }

  @override
  void dispose() {
    _videoController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    // Fill the entire screen without any margins or empty spaces (edge-to-edge)
    return Scaffold(
      backgroundColor: Colors.white,
      body: SizedBox.expand(
        child: _isVideoInitialized
            ? FittedBox(
                fit: BoxFit.cover,
                child: SizedBox(
                  width: _videoController.value.size.width,
                  height: _videoController.value.size.height,
                  child: VideoPlayer(_videoController),
                ),
              )
            : Image.asset(
                'assets/images/image1.png',
                fit: BoxFit.contain,
              ),
      ),
    );
  }
}

// ──────────────────────────────────────────────
// Screen 2: Onboarding Screen
// ──────────────────────────────────────────────
class OnboardingScreen extends StatelessWidget {
  const OnboardingScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.white,
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 20),
          child: Column(
            children: [
              const SizedBox(height: 20),
              Container(
                width: 70,
                height: 70,
                padding: const EdgeInsets.all(10),
                decoration: BoxDecoration(
                  color: AppTheme.subtleBlue,
                  borderRadius: BorderRadius.circular(16),
                ),
                child: Image.asset('assets/images/image1.png', fit: BoxFit.contain),
              ),
              const SizedBox(height: 12),
              const Text(
                'SAPCON Instruments',
                style: TextStyle(fontSize: 20, fontWeight: FontWeight.bold, color: AppTheme.primaryNavy),
              ),
              const Text(
                'Measure | Monitor | Control',
                style: TextStyle(fontSize: 12, color: AppTheme.secondaryText),
              ),
              const Spacer(),
              Container(
                height: 240,
                decoration: BoxDecoration(
                  borderRadius: BorderRadius.circular(16),
                  image: const DecorationImage(
                    image: AssetImage('assets/images/image2.png'),
                    fit: BoxFit.cover,
                  ),
                ),
              ),
              const SizedBox(height: 24),
              const Text(
                'Smart Sales Communication\nfor a Connected Industry',
                textAlign: TextAlign.center,
                style: TextStyle(
                  fontSize: 22,
                  fontWeight: FontWeight.bold,
                  color: AppTheme.mainText,
                  height: 1.3,
                ),
              ),
              const SizedBox(height: 12),
              const Text(
                'Manage leads, automate customer emails, and respond to technical inquiries with AI-powered assistance.',
                textAlign: TextAlign.center,
                style: TextStyle(fontSize: 14, color: AppTheme.secondaryText, height: 1.4),
              ),
              const SizedBox(height: 24),
              Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Container(width: 24, height: 6, decoration: BoxDecoration(color: AppTheme.actionBlue, borderRadius: BorderRadius.circular(3))),
                  const SizedBox(width: 6),
                  Container(width: 6, height: 6, decoration: BoxDecoration(color: AppTheme.border, borderRadius: BorderRadius.circular(3))),
                  const SizedBox(width: 6),
                  Container(width: 6, height: 6, decoration: BoxDecoration(color: AppTheme.border, borderRadius: BorderRadius.circular(3))),
                ],
              ),
              const Spacer(),
              ElevatedButton(
                onPressed: () {
                  Navigator.pushReplacement(
                    context,
                    MaterialPageRoute(builder: (_) => const LoginScreen()),
                  );
                },
                child: const Row(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    Text('Get Started'),
                    SizedBox(width: 8),
                    Icon(Icons.arrow_forward, size: 18),
                  ],
                ),
              ),
              const SizedBox(height: 12),
            ],
          ),
        ),
      ),
    );
  }
}

// ──────────────────────────────────────────────
// Screen 3: Login Screen
// ──────────────────────────────────────────────
class LoginScreen extends StatefulWidget {
  const LoginScreen({super.key});

  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> with WidgetsBindingObserver {
  final _emailController = TextEditingController();
  final _passwordController = TextEditingController();
  bool _obscurePassword = true;
  bool _rememberMe = true;
  bool _isLoading = false;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _emailController.dispose();
    _passwordController.dispose();
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) {
      _checkGoogleAuthStatus();
    }
  }

  Future<void> _checkGoogleAuthStatus() async {
    final auth = await ApiService.getAuthStatus();
    if (!mounted) return;
    if (auth['authenticated'] == true && auth['email'] != null) {
      Navigator.pushReplacement(
        context,
        MaterialPageRoute(
          builder: (_) => MainNavigationScaffold(userEmail: auth['email']),
        ),
      );
    }
  }

  Future<void> _handleLogin() async {
    final email = _emailController.text.trim();
    final password = _passwordController.text;

    if (email.isEmpty || !email.contains('@')) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Please enter a valid email address')),
      );
      return;
    }
    if (password.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Please enter your password')),
      );
      return;
    }

    setState(() => _isLoading = true);
    final res = await ApiService.login(email: email, password: password);
    if (!mounted) return;
    setState(() => _isLoading = false);

    if (res['success'] == true) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(res['message'] ?? 'Login successful!'),
          backgroundColor: AppTheme.success,
        ),
      );
      Navigator.pushReplacement(
        context,
        MaterialPageRoute(
          builder: (_) => MainNavigationScaffold(
            userEmail: email,
          ),
        ),
      );
    } else {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(res['detail'] ?? 'Login failed. Please check credentials.'),
          backgroundColor: AppTheme.error,
        ),
      );
    }
  }

  Future<void> _handleGoogleLogin() async {
    setState(() => _isLoading = true);
    try {
      // 1. First fetch direct Google OAuth consent URL from server
      String? targetUrl = await ApiService.getGoogleLoginUrl();
      // Fallback to /auth/login redirect endpoint if direct URL not returned
      targetUrl ??= '${ApiService.baseUrl}/auth/login';

      final uri = Uri.parse(targetUrl);
      final launched = await launchUrl(uri, mode: LaunchMode.externalApplication);
      if (!launched) {
        // Fallback: try platform default mode
        await launchUrl(uri, mode: LaunchMode.platformDefault);
      }
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Opening Google Sign In in your browser...'),
          duration: Duration(seconds: 3),
        ),
      );
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Could not open browser: $e')),
      );
    } finally {
      if (mounted) setState(() => _isLoading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.white,
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 20),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.center,
            children: [
              const SizedBox(height: 20),
              Container(
                width: 60,
                height: 60,
                padding: const EdgeInsets.all(8),
                decoration: BoxDecoration(
                  color: AppTheme.subtleBlue,
                  borderRadius: BorderRadius.circular(14),
                ),
                child: Image.asset('assets/images/image1.png', fit: BoxFit.contain),
              ),
              const SizedBox(height: 10),
              const Text(
                'SAPCON Instruments',
                style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold, color: AppTheme.primaryNavy),
              ),
              const Text('Sales Workbench', style: TextStyle(fontSize: 13, color: AppTheme.secondaryText)),
              const SizedBox(height: 32),
              const Text(
                'Welcome Back',
                style: TextStyle(fontSize: 24, fontWeight: FontWeight.bold, color: AppTheme.mainText),
              ),
              const SizedBox(height: 6),
              const Text(
                'Sign in to your account to continue',
                style: TextStyle(fontSize: 14, color: AppTheme.secondaryText),
              ),
              const SizedBox(height: 28),
              TextField(
                controller: _emailController,
                keyboardType: TextInputType.emailAddress,
                decoration: const InputDecoration(
                  labelText: 'Email Address',
                  hintText: 'e.g. yourname@company.com',
                  prefixIcon: Icon(Icons.email_outlined, color: AppTheme.secondaryText),
                ),
              ),
              const SizedBox(height: 16),
              TextField(
                controller: _passwordController,
                obscureText: _obscurePassword,
                decoration: InputDecoration(
                  labelText: 'Password',
                  hintText: 'Enter your password',
                  prefixIcon: const Icon(Icons.lock_outline, color: AppTheme.secondaryText),
                  suffixIcon: IconButton(
                    icon: Icon(_obscurePassword ? Icons.visibility_off : Icons.visibility, color: AppTheme.secondaryText),
                    onPressed: () => setState(() => _obscurePassword = !_obscurePassword),
                  ),
                ),
              ),
              const SizedBox(height: 12),
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Row(
                    children: [
                      Checkbox(
                        value: _rememberMe,
                        activeColor: AppTheme.actionBlue,
                        onChanged: (v) => setState(() => _rememberMe = v ?? true),
                      ),
                      const Text('Remember me', style: TextStyle(fontSize: 13, color: AppTheme.secondaryText)),
                    ],
                  ),
                  TextButton(
                    onPressed: () {
                      Navigator.push(context, MaterialPageRoute(builder: (_) => const ForgotPasswordScreen()));
                    },
                    child: const Text('Forgot Password?', style: TextStyle(fontSize: 13, color: AppTheme.actionBlue)),
                  ),
                ],
              ),
              const SizedBox(height: 20),
              ElevatedButton(
                onPressed: _isLoading ? null : _handleLogin,
                child: _isLoading
                    ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                    : const Text('Sign In'),
              ),
              const SizedBox(height: 20),
              Row(
                children: [
                  const Expanded(child: Divider(color: AppTheme.border)),
                  Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 16),
                    child: Text('OR', style: TextStyle(color: Colors.grey[500], fontSize: 12)),
                  ),
                  const Expanded(child: Divider(color: AppTheme.border)),
                ],
              ),
              const SizedBox(height: 20),
              OutlinedButton.icon(
                onPressed: _handleGoogleLogin,
                icon: const Icon(Icons.g_mobiledata, size: 28, color: AppTheme.primaryNavy),
                label: const Text('Continue with Google'),
              ),
              const SizedBox(height: 30),
              Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  const Text("Don't have an account? ", style: TextStyle(color: AppTheme.secondaryText, fontSize: 14)),
                  GestureDetector(
                    onTap: () {
                      Navigator.push(context, MaterialPageRoute(builder: (_) => const SignUpScreen()));
                    },
                    child: const Text(
                      'Sign Up',
                      style: TextStyle(color: AppTheme.actionBlue, fontWeight: FontWeight.bold, fontSize: 14),
                    ),
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}

// ──────────────────────────────────────────────
// Screen 4: Sign Up Screen
// ──────────────────────────────────────────────
class SignUpScreen extends StatefulWidget {
  const SignUpScreen({super.key});

  @override
  State<SignUpScreen> createState() => _SignUpScreenState();
}

class _SignUpScreenState extends State<SignUpScreen> with WidgetsBindingObserver {
  final _nameController = TextEditingController();
  final _emailController = TextEditingController();
  final _passwordController = TextEditingController();
  final _confirmPasswordController = TextEditingController();
  bool _agreeTerms = true;
  bool _isLoading = false;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _nameController.dispose();
    _emailController.dispose();
    _passwordController.dispose();
    _confirmPasswordController.dispose();
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) {
      _checkGoogleAuthStatus();
    }
  }

  Future<void> _checkGoogleAuthStatus() async {
    final auth = await ApiService.getAuthStatus();
    if (!mounted) return;
    if (auth['authenticated'] == true && auth['email'] != null) {
      Navigator.pushReplacement(
        context,
        MaterialPageRoute(
          builder: (_) => MainNavigationScaffold(userEmail: auth['email']),
        ),
      );
    }
  }

  Future<void> _handleGoogleLogin() async {
    setState(() => _isLoading = true);
    try {
      // 1. First fetch direct Google OAuth consent URL from server
      String? targetUrl = await ApiService.getGoogleLoginUrl();
      // Fallback to /auth/login redirect endpoint if direct URL not returned
      targetUrl ??= '${ApiService.baseUrl}/auth/login';

      final uri = Uri.parse(targetUrl);
      final launched = await launchUrl(uri, mode: LaunchMode.externalApplication);
      if (!launched) {
        // Fallback: try platform default mode
        await launchUrl(uri, mode: LaunchMode.platformDefault);
      }
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Opening Google Sign In in your browser...'),
          duration: Duration(seconds: 3),
        ),
      );
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Could not open browser: $e')),
      );
    } finally {
      if (mounted) setState(() => _isLoading = false);
    }
  }

  Future<void> _handleSignup() async {
    final name = _nameController.text.trim();
    final email = _emailController.text.trim();
    final password = _passwordController.text;
    final confirm = _confirmPasswordController.text;

    if (name.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Please enter your full name')),
      );
      return;
    }
    if (email.isEmpty || !email.contains('@')) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Please enter a valid email address')),
      );
      return;
    }
    if (password.length < 6) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Password must be at least 6 characters')),
      );
      return;
    }
    if (password != confirm) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Passwords do not match')),
      );
      return;
    }
    if (!_agreeTerms) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Please agree to terms and conditions')),
      );
      return;
    }

    setState(() => _isLoading = true);
    final res = await ApiService.register(name: name, email: email, password: password);
    if (!mounted) return;
    setState(() => _isLoading = false);

    if (res['success'] == true) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(res['message'] ?? 'Account created! Welcome.'),
          backgroundColor: AppTheme.success,
        ),
      );
      Navigator.pushReplacement(
        context,
        MaterialPageRoute(
          builder: (_) => MainNavigationScaffold(userEmail: email),
        ),
      );
    } else {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(res['detail'] ?? 'Registration failed. Try again.'),
          backgroundColor: AppTheme.error,
        ),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.white,
      appBar: AppBar(
        leading: IconButton(
          icon: const Icon(Icons.arrow_back),
          onPressed: () => Navigator.pop(context),
        ),
      ),
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 10),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.center,
            children: [
              Container(
                width: 50,
                height: 50,
                padding: const EdgeInsets.all(8),
                decoration: BoxDecoration(
                  color: AppTheme.subtleBlue,
                  borderRadius: BorderRadius.circular(12),
                ),
                child: Image.asset('assets/images/image1.png', fit: BoxFit.contain),
              ),
              const SizedBox(height: 16),
              const Text(
                'Create Your Account',
                style: TextStyle(fontSize: 22, fontWeight: FontWeight.bold, color: AppTheme.mainText),
              ),
              const SizedBox(height: 6),
              const Text('Join SAPCON Sales Workbench', style: TextStyle(fontSize: 14, color: AppTheme.secondaryText)),
              const SizedBox(height: 24),
              TextField(
                controller: _nameController,
                decoration: const InputDecoration(
                  labelText: 'Full Name',
                  hintText: 'Enter your full name',
                  prefixIcon: Icon(Icons.person_outline, color: AppTheme.secondaryText),
                ),
              ),
              const SizedBox(height: 16),
              TextField(
                controller: _emailController,
                keyboardType: TextInputType.emailAddress,
                decoration: const InputDecoration(
                  labelText: 'Email Address',
                  hintText: 'Enter your email address',
                  prefixIcon: Icon(Icons.email_outlined, color: AppTheme.secondaryText),
                ),
              ),
              const SizedBox(height: 16),
              TextField(
                controller: _passwordController,
                obscureText: true,
                decoration: const InputDecoration(
                  labelText: 'Password',
                  hintText: 'Create a strong password (min 6 chars)',
                  prefixIcon: Icon(Icons.lock_outline, color: AppTheme.secondaryText),
                ),
              ),
              const SizedBox(height: 16),
              TextField(
                controller: _confirmPasswordController,
                obscureText: true,
                decoration: const InputDecoration(
                  labelText: 'Confirm Password',
                  hintText: 'Confirm your password',
                  prefixIcon: Icon(Icons.lock_outline, color: AppTheme.secondaryText),
                ),
              ),
              const SizedBox(height: 16),
              Row(
                children: [
                  Checkbox(
                    value: _agreeTerms,
                    activeColor: AppTheme.actionBlue,
                    onChanged: (v) => setState(() => _agreeTerms = v ?? true),
                  ),
                  Expanded(
                    child: RichText(
                      text: const TextSpan(
                        text: 'I agree to the ',
                        style: TextStyle(color: AppTheme.secondaryText, fontSize: 12),
                        children: [
                          TextSpan(text: 'Terms & Conditions', style: TextStyle(color: AppTheme.actionBlue, fontWeight: FontWeight.bold)),
                          TextSpan(text: ' and '),
                          TextSpan(text: 'Privacy Policy', style: TextStyle(color: AppTheme.actionBlue, fontWeight: FontWeight.bold)),
                        ],
                      ),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 24),
              ElevatedButton(
                onPressed: _isLoading ? null : _handleSignup,
                child: _isLoading
                    ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                    : const Text('Create Account'),
              ),
              const SizedBox(height: 20),
              Row(
                children: [
                  const Expanded(child: Divider(color: AppTheme.border)),
                  Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 16),
                    child: Text('OR', style: TextStyle(color: Colors.grey[500], fontSize: 12)),
                  ),
                  const Expanded(child: Divider(color: AppTheme.border)),
                ],
              ),
              const SizedBox(height: 20),
              OutlinedButton.icon(
                onPressed: _handleGoogleLogin,
                icon: const Icon(Icons.g_mobiledata, size: 28, color: AppTheme.primaryNavy),
                label: const Text('Sign up with Google'),
              ),
              const SizedBox(height: 24),
              Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  const Text('Already have an account? ', style: TextStyle(color: AppTheme.secondaryText, fontSize: 14)),
                  GestureDetector(
                    onTap: () => Navigator.pop(context),
                    child: const Text('Sign In', style: TextStyle(color: AppTheme.actionBlue, fontWeight: FontWeight.bold, fontSize: 14)),
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}

// ──────────────────────────────────────────────
// Screen 5: Forgot Password Screen
// ──────────────────────────────────────────────
class ForgotPasswordScreen extends StatefulWidget {
  const ForgotPasswordScreen({super.key});

  @override
  State<ForgotPasswordScreen> createState() => _ForgotPasswordScreenState();
}

class _ForgotPasswordScreenState extends State<ForgotPasswordScreen> {
  final _emailController = TextEditingController();
  bool _submitted = false;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.white,
      appBar: AppBar(
        leading: IconButton(
          icon: const Icon(Icons.arrow_back),
          onPressed: () => Navigator.pop(context),
        ),
      ),
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 20),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Text(
                'Forgot Your Password?',
                style: TextStyle(fontSize: 24, fontWeight: FontWeight.bold, color: AppTheme.mainText),
              ),
              const SizedBox(height: 8),
              const Text(
                'Enter your registered email address to receive password reset instructions.',
                style: TextStyle(fontSize: 14, color: AppTheme.secondaryText, height: 1.4),
              ),
              const SizedBox(height: 32),
              TextField(
                controller: _emailController,
                keyboardType: TextInputType.emailAddress,
                decoration: const InputDecoration(
                  labelText: 'Email Address',
                  hintText: 'e.g. sales@sapcon.in',
                  prefixIcon: Icon(Icons.email_outlined, color: AppTheme.secondaryText),
                ),
              ),
              const SizedBox(height: 24),
              ElevatedButton(
                onPressed: () {
                  setState(() => _submitted = true);
                },
                child: const Text('Send Reset Link'),
              ),
              if (_submitted) ...[
                const SizedBox(height: 20),
                Container(
                  padding: const EdgeInsets.all(14),
                  decoration: BoxDecoration(
                    color: const Color(0xFFF0FDF4),
                    borderRadius: BorderRadius.circular(10),
                    border: const Border(left: BorderSide(color: AppTheme.success, width: 4)),
                  ),
                  child: const Text(
                    'Reset instructions sent! Please check your email inbox.',
                    style: TextStyle(color: Color(0xFF166534), fontSize: 13, fontWeight: FontWeight.w500),
                  ),
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }
}

// ──────────────────────────────────────────────
// Main Shell: Persistent Bottom Navigation (5 tabs) + Drawer
// ──────────────────────────────────────────────
class MainNavigationScaffold extends StatefulWidget {
  final String userEmail;
  final int initialIndex;

  const MainNavigationScaffold({
    super.key,
    required this.userEmail,
    this.initialIndex = 0,
  });

  @override
  State<MainNavigationScaffold> createState() => _MainNavigationScaffoldState();
}

class _MainNavigationScaffoldState extends State<MainNavigationScaffold> {
  late int _currentIndex;
  final GlobalKey<ScaffoldState> _scaffoldKey = GlobalKey<ScaffoldState>();

  @override
  void initState() {
    super.initState();
    _currentIndex = widget.initialIndex;
  }

  void _onTabSelected(int index) {
    if (index == 4) {
      _scaffoldKey.currentState?.openEndDrawer();
    } else {
      setState(() => _currentIndex = index);
    }
  }

  @override
  Widget build(BuildContext context) {
    final screens = [
      HomeScreen(
        userEmail: widget.userEmail,
        onNavigateTab: (idx) => setState(() => _currentIndex = idx),
      ),
      const OutboxScreen(),
      const LeadsScreen(),
      const InquiriesScreen(),
    ];

    return Scaffold(
      key: _scaffoldKey,
      endDrawer: NavigationDrawerWidget(
        userEmail: widget.userEmail,
        onSelectTab: (idx) {
          if (idx >= 0 && idx < screens.length) {
            setState(() => _currentIndex = idx);
          }
        },
      ),
      body: IndexedStack(
        index: _currentIndex,
        children: screens,
      ),
      bottomNavigationBar: Container(
        decoration: const BoxDecoration(
          color: Colors.white,
          border: Border(top: BorderSide(color: AppTheme.border, width: 1)),
        ),
        child: BottomNavigationBar(
          currentIndex: _currentIndex,
          onTap: _onTabSelected,
          type: BottomNavigationBarType.fixed,
          backgroundColor: Colors.white,
          selectedItemColor: AppTheme.actionBlue,
          unselectedItemColor: AppTheme.secondaryText,
          selectedFontSize: 12,
          unselectedFontSize: 12,
          elevation: 0,
          items: const [
            BottomNavigationBarItem(icon: Icon(Icons.home_outlined), activeIcon: Icon(Icons.home), label: 'Home'),
            BottomNavigationBarItem(icon: Icon(Icons.mail_outline), activeIcon: Icon(Icons.mail), label: 'Outbox'),
            BottomNavigationBarItem(icon: Icon(Icons.person_add_alt), activeIcon: Icon(Icons.person_add), label: 'Leads'),
            BottomNavigationBarItem(icon: Icon(Icons.chat_bubble_outline), activeIcon: Icon(Icons.chat_bubble), label: 'Inquiries'),
            BottomNavigationBarItem(icon: Icon(Icons.more_horiz), activeIcon: Icon(Icons.more_horiz), label: 'More'),
          ],
        ),
      ),
    );
  }
}

// ──────────────────────────────────────────────
// Screen 6: Home Dashboard
// ──────────────────────────────────────────────
class HomeScreen extends StatefulWidget {
  final String userEmail;
  final Function(int) onNavigateTab;

  const HomeScreen({
    super.key,
    required this.userEmail,
    required this.onNavigateTab,
  });

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> {
  Map<String, dynamic> _metrics = {
    'pending_review': 0,
    'approved': 0,
    'sent': 0,
    'total_leads': 0,
  };
  bool _isLoading = true;

  @override
  void initState() {
    super.initState();
    _fetchStats();
  }

  Future<void> _fetchStats() async {
    final res = await ApiService.getQueue();
    if (res['metrics'] != null && mounted) {
      setState(() {
        _metrics = res['metrics'];
        _isLoading = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppTheme.background,
      appBar: AppBar(
        titleSpacing: 16,
        title: Row(
          children: [
            Container(
              width: 32,
              height: 32,
              padding: const EdgeInsets.all(4),
              decoration: BoxDecoration(
                color: AppTheme.subtleBlue,
                borderRadius: BorderRadius.circular(8),
              ),
              child: Image.asset('assets/images/image1.png', fit: BoxFit.contain),
            ),
            const SizedBox(width: 10),
            const Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('SAPCON Instruments', style: TextStyle(fontSize: 14, fontWeight: FontWeight.bold, color: AppTheme.primaryNavy)),
                Text('Sales Workbench', style: TextStyle(fontSize: 11, color: AppTheme.secondaryText)),
              ],
            ),
          ],
        ),
        actions: [
          CircleAvatar(
            radius: 16,
            backgroundColor: AppTheme.primaryNavy,
            child: Text(
              widget.userEmail.isNotEmpty ? widget.userEmail[0].toUpperCase() : 'U',
              style: const TextStyle(color: Colors.white, fontSize: 13, fontWeight: FontWeight.bold),
            ),
          ),
          const SizedBox(width: 16),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: _fetchStats,
        child: SingleChildScrollView(
          physics: const AlwaysScrollableScrollPhysics(),
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                'Good Morning,\n${widget.userEmail.split('@')[0]}',
                style: const TextStyle(
                  fontSize: 22,
                  fontWeight: FontWeight.bold,
                  color: AppTheme.mainText,
                  height: 1.25,
                ),
              ),
              const SizedBox(height: 4),
              const Text(
                'Manage your sales communication with AI-powered assistance.',
                style: TextStyle(fontSize: 13, color: AppTheme.secondaryText),
              ),
              const SizedBox(height: 18),
              // Industrial Plant Banner
              Container(
                width: double.infinity,
                height: 120,
                decoration: BoxDecoration(
                  borderRadius: BorderRadius.circular(14),
                  image: const DecorationImage(
                    image: AssetImage('assets/images/image2.png'),
                    fit: BoxFit.cover,
                  ),
                ),
                child: Container(
                  padding: const EdgeInsets.all(14),
                  decoration: BoxDecoration(
                    borderRadius: BorderRadius.circular(14),
                    gradient: LinearGradient(
                      colors: [
                        AppTheme.deepNavy.withOpacity(0.85),
                        Colors.transparent,
                      ],
                    ),
                  ),
                  child: const Align(
                    alignment: Alignment.bottomLeft,
                    child: Text(
                      'Trusted Level, Flow & Speed\nMeasurement Solutions Since 1983 →',
                      style: TextStyle(
                        color: Colors.white,
                        fontSize: 13,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ),
                ),
              ),
              const SizedBox(height: 20),
              // 4 Primary Module Grid
              GridView.count(
                shrinkWrap: true,
                physics: const NeverScrollableScrollPhysics(),
                crossAxisCount: 2,
                crossAxisSpacing: 12,
                mainAxisSpacing: 12,
                childAspectRatio: 1.25,
                children: [
                  _buildModuleCard(
                    title: 'Outbox Drafts',
                    badge: '${_metrics['pending_review'] ?? 0} Pending',
                    icon: Icons.mark_email_unread_outlined,
                    iconBg: const Color(0xFFFEF3C7),
                    iconColor: AppTheme.warning,
                    onTap: () => widget.onNavigateTab(1),
                  ),
                  _buildModuleCard(
                    title: 'New Leads',
                    badge: 'Import & Create',
                    icon: Icons.person_add_alt_outlined,
                    iconBg: AppTheme.subtleBlue,
                    iconColor: AppTheme.actionBlue,
                    onTap: () => widget.onNavigateTab(2),
                  ),
                  _buildModuleCard(
                    title: 'Client Inquiries',
                    badge: 'Direct Gmail Feed',
                    icon: Icons.chat_bubble_outline,
                    iconBg: const Color(0xFFF3E8FF),
                    iconColor: const Color(0xFF9333EA),
                    onTap: () => widget.onNavigateTab(3),
                  ),
                  _buildModuleCard(
                    title: 'Email Templates',
                    badge: 'Level / Speed / Flow',
                    icon: Icons.article_outlined,
                    iconBg: const Color(0xFFDCFCE7),
                    iconColor: AppTheme.success,
                    onTap: () {
                      NavigationDrawerWidget(userEmail: widget.userEmail, onSelectTab: widget.onNavigateTab).showTemplatesModal(context);
                    },
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildModuleCard({
    required String title,
    required String badge,
    required IconData icon,
    required Color iconBg,
    required Color iconColor,
    required VoidCallback onTap,
  }) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(14),
      child: Container(
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(14),
          border: Border.all(color: AppTheme.border),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            Container(
              padding: const EdgeInsets.all(8),
              decoration: BoxDecoration(color: iconBg, borderRadius: BorderRadius.circular(10)),
              child: Icon(icon, color: iconColor, size: 22),
            ),
            Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(title, style: const TextStyle(fontSize: 14, fontWeight: FontWeight.bold, color: AppTheme.mainText)),
                const SizedBox(height: 2),
                Text(badge, style: const TextStyle(fontSize: 11, color: AppTheme.secondaryText)),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

// ──────────────────────────────────────────────
// Screen 7: Outbox Drafts Screen
// ──────────────────────────────────────────────
class OutboxScreen extends StatefulWidget {
  const OutboxScreen({super.key});

  @override
  State<OutboxScreen> createState() => _OutboxScreenState();
}

class _OutboxScreenState extends State<OutboxScreen> {
  List<dynamic> _drafts = [];
  Map<String, dynamic> _metrics = {'pending_review': 0, 'approved': 0, 'sent': 0};
  String _activeFilter = 'All';
  String _searchQuery = '';
  bool _isLoading = true;

  @override
  void initState() {
    super.initState();
    _fetchDrafts();
  }

  Future<void> _fetchDrafts() async {
    setState(() => _isLoading = true);
    final res = await ApiService.getQueue();
    if (mounted) {
      setState(() {
        final pendingList = (res['queue'] as List<dynamic>? ?? []).map((d) {
          final m = Map<String, dynamic>.from(d);
          m['status'] = m['status'] ?? 'Waiting for Approval';
          return m;
        }).toList();

        final sentList = (res['sent_leads'] as List<dynamic>? ?? []).map((d) {
          final m = Map<String, dynamic>.from(d);
          m['status'] = 'Sent Out';
          return m;
        }).toList();

        final approvedList = (res['approved_leads'] as List<dynamic>? ?? []).map((d) {
          final m = Map<String, dynamic>.from(d);
          m['status'] = 'Approved';
          return m;
        }).toList();

        _drafts = [...pendingList, ...approvedList, ...sentList];
        _metrics = res['metrics'] ?? _metrics;
        _isLoading = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final filtered = _drafts.where((d) {
      final status = (d['status'] ?? '').toString();
      if (_activeFilter == 'Pending' && !status.contains('Waiting') && !status.contains('Pending')) return false;
      if (_activeFilter == 'Approved' && !status.contains('Approved')) return false;
      if (_activeFilter == 'Sent' && !status.contains('Sent')) return false;
      if (_searchQuery.isNotEmpty) {
        final query = _searchQuery.toLowerCase();
        final company = (d['company_name'] ?? '').toString().toLowerCase();
        final email = (d['email'] ?? '').toString().toLowerCase();
        final subject = (d['subject'] ?? '').toString().toLowerCase();
        return company.contains(query) || email.contains(query) || subject.contains(query);
      }
      return true;
    }).toList();

    return Scaffold(
      backgroundColor: AppTheme.background,
      appBar: AppBar(
        title: const Text('Outbox Drafts', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 18)),
        actions: [
          IconButton(icon: const Icon(Icons.refresh), onPressed: _fetchDrafts),
        ],
      ),
      body: Column(
        children: [
          Container(
            color: Colors.white,
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
            child: TextField(
              onChanged: (v) => setState(() => _searchQuery = v),
              decoration: InputDecoration(
                hintText: 'Search company or subject...',
                prefixIcon: const Icon(Icons.search, size: 20, color: AppTheme.secondaryText),
                contentPadding: const EdgeInsets.symmetric(vertical: 10),
                fillColor: AppTheme.background,
                border: OutlineInputBorder(borderRadius: BorderRadius.circular(10), borderSide: BorderSide.none),
              ),
            ),
          ),
          // Metric cards row
          Container(
            color: Colors.white,
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
            child: Row(
              children: [
                _buildSummaryBadge('Pending', '${_metrics['pending_review'] ?? 0}', AppTheme.warning),
                const SizedBox(width: 8),
                _buildSummaryBadge('Approved', '${_metrics['approved'] ?? 0}', AppTheme.actionBlue),
                const SizedBox(width: 8),
                _buildSummaryBadge('Sent', '${_metrics['sent'] ?? 0}', AppTheme.success),
              ],
            ),
          ),
          // Filter Chips
          Container(
            color: Colors.white,
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
            child: SingleChildScrollView(
              scrollDirection: Axis.horizontal,
              child: Row(
                children: [
                  {'label': 'All (${_drafts.length})', 'key': 'All'},
                  {'label': 'Pending Review', 'key': 'Pending'},
                  {'label': 'Approved', 'key': 'Approved'},
                  {'label': 'Sent Out', 'key': 'Sent'},
                ].map((f) {
                  final key = f['key']!;
                  final label = f['label']!;
                  final isSelected = _activeFilter == key;
                  return Padding(
                    padding: const EdgeInsets.only(right: 8),
                    child: ChoiceChip(
                      label: Text(label),
                      selected: isSelected,
                      selectedColor: AppTheme.subtleBlue,
                      labelStyle: TextStyle(
                        color: isSelected ? AppTheme.actionBlue : AppTheme.secondaryText,
                        fontWeight: isSelected ? FontWeight.bold : FontWeight.normal,
                        fontSize: 12,
                      ),
                      onSelected: (_) => setState(() => _activeFilter = key),
                    ),
                  );
                }).toList(),
              ),
            ),
          ),
          const Divider(height: 1, color: AppTheme.border),
          // Draft List
          Expanded(
            child: _isLoading
                ? const Center(child: CircularProgressIndicator())
                : filtered.isEmpty
                    ? Center(
                        child: Column(
                          mainAxisSize: MainAxisSize.min,
                          children: const [
                            Icon(Icons.mark_email_read_outlined, size: 60, color: AppTheme.secondaryText),
                            SizedBox(height: 12),
                            Text("You're all caught up", style: TextStyle(fontWeight: FontWeight.bold, fontSize: 16)),
                            SizedBox(height: 4),
                            Text('Newly generated sales drafts will appear here.', style: TextStyle(color: AppTheme.secondaryText, fontSize: 13)),
                          ],
                        ),
                      )
                    : ListView.separated(
                        padding: const EdgeInsets.all(16),
                        itemCount: filtered.length,
                        separatorBuilder: (_, __) => const SizedBox(height: 10),
                        itemBuilder: (context, idx) {
                          final item = filtered[idx];
                          return _buildDraftCard(item);
                        },
                      ),
          ),
        ],
      ),
    );
  }

  Widget _buildSummaryBadge(String label, String value, Color color) {
    return Expanded(
      child: Container(
        padding: const EdgeInsets.symmetric(vertical: 8, horizontal: 10),
        decoration: BoxDecoration(
          color: color.withOpacity(0.08),
          borderRadius: BorderRadius.circular(10),
          border: Border.all(color: color.withOpacity(0.2)),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(value, style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold, color: color)),
            Text(label, style: const TextStyle(fontSize: 11, color: AppTheme.secondaryText)),
          ],
        ),
      ),
    );
  }

  Widget _buildDraftCard(Map<String, dynamic> item) {
    final company = item['company_name'] ?? 'Company';
    final email = item['email'] ?? '';
    final subject = item['subject'] ?? 'Sales Inquiry Proposal';
    final status = (item['status'] ?? 'Waiting for Approval').toString();

    Color badgeColor = AppTheme.warning;
    if (status.contains('Approved')) badgeColor = AppTheme.actionBlue;
    if (status.contains('Sent')) badgeColor = AppTheme.success;

    return InkWell(
      onTap: () {
        Navigator.push(
          context,
          MaterialPageRoute(
            builder: (_) => DraftDetailScreen(draft: item, onUpdated: _fetchDrafts),
          ),
        );
      },
      borderRadius: BorderRadius.circular(14),
      child: Container(
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(14),
          border: Border.all(color: AppTheme.border),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                CircleAvatar(
                  radius: 18,
                  backgroundColor: AppTheme.subtleBlue,
                  child: Text(
                    company.isNotEmpty ? company[0].toUpperCase() : 'C',
                    style: const TextStyle(color: AppTheme.primaryNavy, fontWeight: FontWeight.bold),
                  ),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(company, style: const TextStyle(fontSize: 15, fontWeight: FontWeight.bold, color: AppTheme.mainText)),
                      Text(email, style: const TextStyle(fontSize: 12, color: AppTheme.secondaryText)),
                    ],
                  ),
                ),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                  decoration: BoxDecoration(
                    color: badgeColor.withOpacity(0.1),
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: Text(
                    status,
                    style: TextStyle(fontSize: 11, fontWeight: FontWeight.w600, color: badgeColor),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 10),
            Text(
              subject,
              style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w500, color: AppTheme.mainText),
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
            ),
          ],
        ),
      ),
    );
  }
}

// ──────────────────────────────────────────────
// Screen 8: Draft Detail Screen
// ──────────────────────────────────────────────
class DraftDetailScreen extends StatefulWidget {
  final Map<String, dynamic> draft;
  final VoidCallback onUpdated;

  const DraftDetailScreen({
    super.key,
    required this.draft,
    required this.onUpdated,
  });

  @override
  State<DraftDetailScreen> createState() => _DraftDetailScreenState();
}

class _DraftDetailScreenState extends State<DraftDetailScreen> {
  late TextEditingController _subjectController;
  late TextEditingController _bodyController;
  bool _isProcessing = false;
  bool _isPreviewMode = true;

  @override
  void initState() {
    super.initState();
    _subjectController = TextEditingController(text: widget.draft['subject'] ?? '');
    _bodyController = TextEditingController(text: widget.draft['body'] ?? '');
  }

  // Convert raw HTML into clean, human-readable email preview text
  String _getReadableText(String raw) {
    if (raw.isEmpty) return 'No proposal content.';
    if (!raw.contains('<') || !raw.contains('>')) return raw;

    String clean = raw;
    // Strip styles and scripts completely
    clean = clean.replaceAll(RegExp(r'<style[^>]*>[\s\S]*?<\/style>', caseSensitive: false), '');
    clean = clean.replaceAll(RegExp(r'<script[^>]*>[\s\S]*?<\/script>', caseSensitive: false), '');
    clean = clean.replaceAll(RegExp(r'<head[^>]*>[\s\S]*?<\/head>', caseSensitive: false), '');
    // Replace breaks and paragraphs with newlines
    clean = clean.replaceAll(RegExp(r'<\/?(p|br|tr|h\d)[^>]*>', caseSensitive: false), '\n');
    clean = clean.replaceAll(RegExp(r'<td[^>]*>', caseSensitive: false), '  ');
    // Strip remaining tags
    clean = clean.replaceAll(RegExp(r'<[^>]+>'), '');
    // Decode HTML entities
    clean = clean
        .replaceAll('&nbsp;', ' ')
        .replaceAll('&amp;', '&')
        .replaceAll('&lt;', '<')
        .replaceAll('&gt;', '>')
        .replaceAll('&quot;', '"')
        .replaceAll('&#39;', "'")
        .replaceAll('&bull;', '•');
    // Normalize repeated whitespace / blank lines
    clean = clean.replaceAll(RegExp(r'\n{3,}'), '\n\n').trim();
    return clean.isEmpty ? 'Email proposal ready for dispatch.' : clean;
  }

  Future<void> _approveAndSend() async {
    setState(() => _isProcessing = true);
    final queueId = widget.draft['queue_id'] ?? '';
    final res = await ApiService.approveDraft(queueId);
    setState(() => _isProcessing = false);

    if (res['success'] == true && mounted) {
      widget.onUpdated();
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Draft approved & sent via Google OAuth!')),
      );
      Navigator.pop(context);
    } else if (mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Error: ${res['detail'] ?? 'Action failed'}')),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final company = widget.draft['company_name'] ?? 'Company';
    final email = widget.draft['email'] ?? '';
    final status = (widget.draft['status'] ?? 'Waiting for Approval').toString();
    final isSent = status.toLowerCase().contains('sent');

    return Scaffold(
      backgroundColor: Colors.white,
      appBar: AppBar(
        title: const Text('Draft Detail', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 18)),
        actions: [
          if (!isSent)
            IconButton(
              icon: const Icon(Icons.delete_outline, color: AppTheme.error),
              onPressed: () async {
                final queueId = widget.draft['queue_id'] ?? '';
                await ApiService.deleteDraft(queueId);
                widget.onUpdated();
                if (mounted) Navigator.pop(context);
              },
            ),
        ],
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                CircleAvatar(
                  radius: 20,
                  backgroundColor: AppTheme.subtleBlue,
                  child: Text(company[0].toUpperCase(), style: const TextStyle(color: AppTheme.primaryNavy, fontWeight: FontWeight.bold)),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(company, style: const TextStyle(fontSize: 16, fontWeight: FontWeight.bold, color: AppTheme.mainText)),
                      Text(email, style: const TextStyle(fontSize: 13, color: AppTheme.secondaryText)),
                    ],
                  ),
                ),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                  decoration: BoxDecoration(
                    color: isSent ? AppTheme.success.withOpacity(0.1) : AppTheme.warning.withOpacity(0.1),
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: Text(
                    isSent ? 'Sent Out' : 'Pending Review',
                    style: TextStyle(
                      fontSize: 11,
                      fontWeight: FontWeight.bold,
                      color: isSent ? AppTheme.success : AppTheme.warning,
                    ),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 20),
            const Text('Subject', style: TextStyle(fontSize: 13, fontWeight: FontWeight.bold, color: AppTheme.secondaryText)),
            const SizedBox(height: 6),
            TextField(
              controller: _subjectController,
              readOnly: isSent,
              decoration: const InputDecoration(contentPadding: EdgeInsets.all(12)),
            ),
            const SizedBox(height: 16),
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                const Text('Message Body', style: TextStyle(fontSize: 13, fontWeight: FontWeight.bold, color: AppTheme.secondaryText)),
                // View toggle: Preview vs Edit Text
                Container(
                  decoration: BoxDecoration(
                    color: AppTheme.background,
                    borderRadius: BorderRadius.circular(8),
                    border: Border.all(color: AppTheme.border),
                  ),
                  padding: const EdgeInsets.all(2),
                  child: Row(
                    children: [
                      GestureDetector(
                        onTap: () => setState(() => _isPreviewMode = true),
                        child: Container(
                          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                          decoration: BoxDecoration(
                            color: _isPreviewMode ? Colors.white : Colors.transparent,
                            borderRadius: BorderRadius.circular(6),
                            boxShadow: _isPreviewMode ? [const BoxShadow(color: Colors.black12, blurRadius: 2)] : null,
                          ),
                          child: Text(
                            'Preview',
                            style: TextStyle(
                              fontSize: 11,
                              fontWeight: _isPreviewMode ? FontWeight.bold : FontWeight.normal,
                              color: _isPreviewMode ? AppTheme.actionBlue : AppTheme.secondaryText,
                            ),
                          ),
                        ),
                      ),
                      GestureDetector(
                        onTap: () => setState(() => _isPreviewMode = false),
                        child: Container(
                          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                          decoration: BoxDecoration(
                            color: !_isPreviewMode ? Colors.white : Colors.transparent,
                            borderRadius: BorderRadius.circular(6),
                            boxShadow: !_isPreviewMode ? [const BoxShadow(color: Colors.black12, blurRadius: 2)] : null,
                          ),
                          child: Text(
                            'Edit Text',
                            style: TextStyle(
                              fontSize: 11,
                              fontWeight: !_isPreviewMode ? FontWeight.bold : FontWeight.normal,
                              color: !_isPreviewMode ? AppTheme.actionBlue : AppTheme.secondaryText,
                            ),
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
            const SizedBox(height: 8),
            _isPreviewMode
                ? Container(
                    width: double.infinity,
                    constraints: const BoxConstraints(minHeight: 180, maxHeight: 340),
                    padding: const EdgeInsets.all(14),
                    decoration: BoxDecoration(
                      color: const Color(0xFFF8FAFC),
                      borderRadius: BorderRadius.circular(10),
                      border: Border.all(color: AppTheme.border),
                    ),
                    child: SingleChildScrollView(
                      child: Text(
                        _getReadableText(_bodyController.text),
                        style: const TextStyle(
                          fontSize: 13.5,
                          height: 1.6,
                          color: AppTheme.mainText,
                        ),
                      ),
                    ),
                  )
                : TextField(
                    controller: _bodyController,
                    maxLines: 12,
                    readOnly: isSent,
                    decoration: const InputDecoration(contentPadding: EdgeInsets.all(14)),
                  ),
            const SizedBox(height: 16),
            // Product attachment indicator
            Container(
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: AppTheme.background,
                borderRadius: BorderRadius.circular(10),
                border: Border.all(color: AppTheme.border),
              ),
              child: const Row(
                children: [
                  Icon(Icons.picture_as_pdf, color: AppTheme.error, size: 24),
                  SizedBox(width: 10),
                  Expanded(
                    child: Text('SAPCON_Product_Specifications.pdf (2.4 MB)', style: TextStyle(fontSize: 13, fontWeight: FontWeight.w500)),
                  ),
                  Icon(Icons.download, size: 20, color: AppTheme.secondaryText),
                ],
              ),
            ),
            const SizedBox(height: 24),
            if (!isSent)
              Row(
                children: [
                  Expanded(
                    child: OutlinedButton(
                      onPressed: () async {
                        final queueId = widget.draft['queue_id'] ?? '';
                        await ApiService.updateDraft(queueId, _subjectController.text, _bodyController.text);
                        widget.onUpdated();
                        if (mounted) {
                          ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Changes saved')));
                          Navigator.pop(context);
                        }
                      },
                      child: const Text('Save Draft'),
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: ElevatedButton(
                      onPressed: _isProcessing ? null : _approveAndSend,
                      child: _isProcessing
                          ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                          : const Text('Approve & Send'),
                    ),
                  ),
                ],
              ),
          ],
        ),
      ),
    );
  }
}

// ──────────────────────────────────────────────
// Screen 9 & 10: New Leads & Ingestion (Tabs)
// ──────────────────────────────────────────────
class LeadsScreen extends StatefulWidget {
  const LeadsScreen({super.key});

  @override
  State<LeadsScreen> createState() => _LeadsScreenState();
}

class _LeadsScreenState extends State<LeadsScreen> with SingleTickerProviderStateMixin {
  late TabController _tabController;

  // Single lead controllers
  final _companyController = TextEditingController();
  final _emailController = TextEditingController();
  final _demandController = TextEditingController();
  bool _directSendSingle = false;
  bool _isSubmittingLead = false;

  // Upload file state
  PlatformFile? _selectedFile;
  bool _directSendBatch = false;
  bool _isUploadingFile = false;

  @override
  void initState() {
    super.initState();
    _tabController = TabController(length: 2, vsync: this);
  }

  Future<void> _pickFile() async {
    final result = await FilePicker.pickFiles(
      type: FileType.custom,
      allowedExtensions: ['xlsx', 'xls', 'csv'],
      withData: true,
    );
    if (result != null && result.files.isNotEmpty) {
      setState(() => _selectedFile = result.files.first);
    }
  }

  Future<void> _submitSingleLead() async {
    if (_companyController.text.isEmpty || _emailController.text.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Please enter Company Name and Email')));
      return;
    }

    setState(() => _isSubmittingLead = true);
    final res = await ApiService.submitManualLead(
      companyName: _companyController.text.trim(),
      email: _emailController.text.trim(),
      demand: _demandController.text.trim(),
      directSend: _directSendSingle,
    );
    setState(() => _isSubmittingLead = false);

    if (res['success'] == true && mounted) {
      Navigator.push(
        context,
        MaterialPageRoute(
          builder: (_) => ProcessingResultsScreen(
            totalRecords: 1,
            validLeads: 1,
            draftsGenerated: 1,
          ),
        ),
      );
      _companyController.clear();
      _emailController.clear();
      _demandController.clear();
    } else if (mounted) {
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Error: ${res['detail'] ?? 'Failed to submit'}')));
    }
  }

  Future<void> _uploadBatchFile() async {
    if (_selectedFile == null || _selectedFile!.bytes == null) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Please select an Excel or CSV file first')));
      return;
    }

    setState(() => _isUploadingFile = true);
    final res = await ApiService.uploadLeadFile(
      fileBytes: _selectedFile!.bytes!,
      fileName: _selectedFile!.name,
      directSend: _directSendBatch,
    );
    setState(() => _isUploadingFile = false);

    if (res['success'] == true && mounted) {
      final total = res['total_rows'] ?? 0;
      Navigator.push(
        context,
        MaterialPageRoute(
          builder: (_) => ProcessingResultsScreen(
            totalRecords: total,
            validLeads: total,
            draftsGenerated: total,
          ),
        ),
      );
      setState(() => _selectedFile = null);
    } else if (mounted) {
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Upload failed: ${res['detail'] ?? 'Unknown error'}')));
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppTheme.background,
      appBar: AppBar(
        title: const Text('New Leads & File Ingestion', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 18)),
        bottom: TabBar(
          controller: _tabController,
          labelColor: AppTheme.actionBlue,
          unselectedLabelColor: AppTheme.secondaryText,
          indicatorColor: AppTheme.actionBlue,
          indicatorWeight: 3,
          tabs: const [
            Tab(text: 'Upload File'),
            Tab(text: 'Add Single Lead'),
          ],
        ),
      ),
      body: TabBarView(
        controller: _tabController,
        children: [
          // Tab 1: Upload File
          SingleChildScrollView(
            padding: const EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Container(
                  width: double.infinity,
                  padding: const EdgeInsets.all(24),
                  decoration: BoxDecoration(
                    color: Colors.white,
                    borderRadius: BorderRadius.circular(16),
                    border: Border.all(color: AppTheme.border),
                  ),
                  child: Column(
                    children: [
                      Container(
                        padding: const EdgeInsets.all(16),
                        decoration: const BoxDecoration(
                          color: AppTheme.subtleBlue,
                          shape: BoxShape.circle,
                        ),
                        child: const Icon(Icons.cloud_upload_outlined, color: AppTheme.actionBlue, size: 36),
                      ),
                      const SizedBox(height: 14),
                      const Text('Upload Leads File', style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold, color: AppTheme.mainText)),
                      const SizedBox(height: 4),
                      const Text('Supports .xlsx, .xls, .csv formats (up to 10MB)', style: TextStyle(fontSize: 12, color: AppTheme.secondaryText)),
                      const SizedBox(height: 18),
                      ElevatedButton(
                        onPressed: _pickFile,
                        style: ElevatedButton.styleFrom(
                          minimumSize: const Size(180, 44),
                        ),
                        child: const Text('Browse Files'),
                      ),
                      if (_selectedFile != null) ...[
                        const SizedBox(height: 16),
                        Container(
                          padding: const EdgeInsets.all(12),
                          decoration: BoxDecoration(
                            color: AppTheme.background,
                            borderRadius: BorderRadius.circular(10),
                            border: Border.all(color: AppTheme.border),
                          ),
                          child: Row(
                            children: [
                              const Icon(Icons.insert_drive_file, color: AppTheme.actionBlue),
                              const SizedBox(width: 8),
                              Expanded(
                                child: Text(_selectedFile!.name, style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600)),
                              ),
                              IconButton(
                                icon: const Icon(Icons.close, size: 18),
                                onPressed: () => setState(() => _selectedFile = null),
                              ),
                            ],
                          ),
                        ),
                      ],
                    ],
                  ),
                ),
                const SizedBox(height: 20),
                // Direct Send Toggle
                SwitchListTile(
                  title: const Text('Direct Send without Approval', style: TextStyle(fontSize: 14, fontWeight: FontWeight.bold)),
                  subtitle: const Text('Caution: Directly dispatches emails to target leads via Google OAuth', style: TextStyle(fontSize: 12)),
                  value: _directSendBatch,
                  activeColor: AppTheme.actionBlue,
                  onChanged: (v) => setState(() => _directSendBatch = v),
                ),
                const SizedBox(height: 20),
                ElevatedButton(
                  onPressed: _isUploadingFile ? null : _uploadBatchFile,
                  child: _isUploadingFile
                      ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                      : const Text('Draft & Queue for Review'),
                ),
              ],
            ),
          ),
          // Tab 2: Add Single Lead
          SingleChildScrollView(
            padding: const EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                TextField(
                  controller: _companyController,
                  decoration: const InputDecoration(
                    labelText: 'Company Name *',
                    hintText: 'e.g. UltraTech Cement, Reliance',
                  ),
                ),
                const SizedBox(height: 16),
                TextField(
                  controller: _emailController,
                  keyboardType: TextInputType.emailAddress,
                  decoration: const InputDecoration(
                    labelText: 'Target Email Address *',
                    hintText: 'e.g. procurement@company.com',
                  ),
                ),
                const SizedBox(height: 16),
                TextField(
                  controller: _demandController,
                  maxLines: 4,
                  decoration: const InputDecoration(
                    labelText: 'Customer Requirement / Application Demand *',
                    hintText: 'Describe process, high temperature, silos, level or flow...',
                  ),
                ),
                const SizedBox(height: 16),
                SwitchListTile(
                  title: const Text('Direct Send without Approval', style: TextStyle(fontSize: 14, fontWeight: FontWeight.bold)),
                  subtitle: const Text('Immediately sends email via connected Gmail account', style: TextStyle(fontSize: 12)),
                  value: _directSendSingle,
                  activeColor: AppTheme.actionBlue,
                  onChanged: (v) => setState(() => _directSendSingle = v),
                ),
                const SizedBox(height: 20),
                ElevatedButton(
                  onPressed: _isSubmittingLead ? null : _submitSingleLead,
                  child: _isSubmittingLead
                      ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                      : const Text('Draft & Queue for Review'),
                ),
                const SizedBox(height: 10),
                OutlinedButton(
                  onPressed: () {
                    _companyController.clear();
                    _emailController.clear();
                    _demandController.clear();
                  },
                  child: const Text('Reset Form'),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

// ──────────────────────────────────────────────
// Screen 11 & 12: Processing Results Screen
// ──────────────────────────────────────────────
class ProcessingResultsScreen extends StatelessWidget {
  final int totalRecords;
  final int validLeads;
  final int draftsGenerated;

  const ProcessingResultsScreen({
    super.key,
    required this.totalRecords,
    required this.validLeads,
    required this.draftsGenerated,
  });

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.white,
      appBar: AppBar(
        title: const Text('Processing Results', style: TextStyle(fontWeight: FontWeight.bold)),
      ),
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            children: [
              const SizedBox(height: 20),
              Container(
                padding: const EdgeInsets.all(20),
                decoration: const BoxDecoration(
                  color: Color(0xFFDCFCE7),
                  shape: BoxShape.circle,
                ),
                child: const Icon(Icons.check_circle_outline, color: AppTheme.success, size: 50),
              ),
              const SizedBox(height: 16),
              const Text(
                'Processing Completed!',
                style: TextStyle(fontSize: 22, fontWeight: FontWeight.bold, color: AppTheme.mainText),
              ),
              const SizedBox(height: 6),
              const Text(
                'Your lead records were analyzed by Gemini AI and drafts queued.',
                textAlign: TextAlign.center,
                style: TextStyle(fontSize: 14, color: AppTheme.secondaryText),
              ),
              const SizedBox(height: 32),
              Row(
                children: [
                  _buildMetricBox('Total Records', '$totalRecords', AppTheme.primaryNavy),
                  const SizedBox(width: 12),
                  _buildMetricBox('Valid Leads', '$validLeads', AppTheme.actionBlue),
                  const SizedBox(width: 12),
                  _buildMetricBox('Drafts', '$draftsGenerated', AppTheme.success),
                ],
              ),
              const Spacer(),
              ElevatedButton(
                onPressed: () => Navigator.pop(context),
                child: const Text('View Drafts in Outbox'),
              ),
              const SizedBox(height: 12),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildMetricBox(String title, String val, Color color) {
    return Expanded(
      child: Container(
        padding: const EdgeInsets.symmetric(vertical: 16, horizontal: 10),
        decoration: BoxDecoration(
          color: AppTheme.background,
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: AppTheme.border),
        ),
        child: Column(
          children: [
            Text(val, style: TextStyle(fontSize: 22, fontWeight: FontWeight.bold, color: color)),
            const SizedBox(height: 4),
            Text(title, style: const TextStyle(fontSize: 11, color: AppTheme.secondaryText), textAlign: TextAlign.center),
          ],
        ),
      ),
    );
  }
}

// ──────────────────────────────────────────────
// Screen 13: Client Inquiries Screen
// ──────────────────────────────────────────────
class InquiriesScreen extends StatefulWidget {
  const InquiriesScreen({super.key});

  @override
  State<InquiriesScreen> createState() => _InquiriesScreenState();
}

class _InquiriesScreenState extends State<InquiriesScreen> {
  List<dynamic> _emails = [];
  bool _isLoading = true;
  String _search = '';

  @override
  void initState() {
    super.initState();
    _fetchInquiries();
  }

  Future<void> _fetchInquiries() async {
    setState(() => _isLoading = true);
    final res = await ApiService.getRecentInquiries();
    if (mounted) {
      setState(() {
        _emails = res['emails'] ?? [];
        _isLoading = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final filtered = _emails.where((e) {
      if (_search.isEmpty) return true;
      final query = _search.toLowerCase();
      final sender = (e['from'] ?? '').toLowerCase();
      final subject = (e['subject'] ?? '').toLowerCase();
      return sender.contains(query) || subject.contains(query);
    }).toList();

    return Scaffold(
      backgroundColor: AppTheme.background,
      appBar: AppBar(
        title: const Text('Client Inquiries', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 18)),
        actions: [
          IconButton(icon: const Icon(Icons.refresh), onPressed: _fetchInquiries),
        ],
      ),
      body: Column(
        children: [
          Container(
            color: Colors.white,
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
            child: TextField(
              onChanged: (v) => setState(() => _search = v),
              decoration: InputDecoration(
                hintText: 'Search inquiries...',
                prefixIcon: const Icon(Icons.search, size: 20, color: AppTheme.secondaryText),
                contentPadding: const EdgeInsets.symmetric(vertical: 10),
                fillColor: AppTheme.background,
                border: OutlineInputBorder(borderRadius: BorderRadius.circular(10), borderSide: BorderSide.none),
              ),
            ),
          ),
          const Divider(height: 1, color: AppTheme.border),
          Expanded(
            child: _isLoading
                ? const Center(child: CircularProgressIndicator())
                : filtered.isEmpty
                    ? const Center(child: Text('No client inquiries found in Gmail inbox'))
                    : ListView.separated(
                        padding: const EdgeInsets.all(16),
                        itemCount: filtered.length,
                        separatorBuilder: (_, __) => const SizedBox(height: 10),
                        itemBuilder: (context, idx) {
                          final item = filtered[idx];
                          return _buildInquiryRow(item);
                        },
                      ),
          ),
        ],
      ),
    );
  }

  Widget _buildInquiryRow(Map<String, dynamic> item) {
    final from = item['from'] ?? 'Customer';
    final subject = item['subject'] ?? 'Technical Inquiry';
    final snippet = item['snippet'] ?? '';
    final date = item['date'] ?? '';

    return InkWell(
      onTap: () {
        Navigator.push(
          context,
          MaterialPageRoute(
            builder: (_) => EmailDetailScreen(emailItem: item),
          ),
        );
      },
      borderRadius: BorderRadius.circular(14),
      child: Container(
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(14),
          border: Border.all(color: AppTheme.border),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Expanded(
                  child: Text(from, style: const TextStyle(fontSize: 14, fontWeight: FontWeight.bold, color: AppTheme.mainText), maxLines: 1),
                ),
                Text(date, style: const TextStyle(fontSize: 11, color: AppTheme.secondaryText)),
              ],
            ),
            const SizedBox(height: 4),
            Text(subject, style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: AppTheme.primaryNavy), maxLines: 1),
            const SizedBox(height: 4),
            Text(snippet, style: const TextStyle(fontSize: 12, color: AppTheme.secondaryText), maxLines: 2, overflow: TextOverflow.ellipsis),
          ],
        ),
      ),
    );
  }
}

// ──────────────────────────────────────────────
// Screen 14: Email Detail Screen
// ──────────────────────────────────────────────
class EmailDetailScreen extends StatelessWidget {
  final Map<String, dynamic> emailItem;

  const EmailDetailScreen({super.key, required this.emailItem});

  @override
  Widget build(BuildContext context) {
    final from = emailItem['from'] ?? '';
    final subject = emailItem['subject'] ?? '';
    final body = emailItem['body'] ?? emailItem['snippet'] ?? '';
    final date = emailItem['date'] ?? '';

    return Scaffold(
      backgroundColor: Colors.white,
      appBar: AppBar(
        title: const Text('Email Detail', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 18)),
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(subject, style: const TextStyle(fontSize: 18, fontWeight: FontWeight.bold, color: AppTheme.mainText)),
            const SizedBox(height: 12),
            Container(
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: AppTheme.background,
                borderRadius: BorderRadius.circular(10),
              ),
              child: Row(
                children: [
                  CircleAvatar(
                    radius: 18,
                    backgroundColor: AppTheme.subtleBlue,
                    child: Text(from.isNotEmpty ? from[0].toUpperCase() : 'C', style: const TextStyle(color: AppTheme.primaryNavy)),
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(from, style: const TextStyle(fontSize: 13, fontWeight: FontWeight.bold)),
                        Text(date, style: const TextStyle(fontSize: 11, color: AppTheme.secondaryText)),
                      ],
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 20),
            const Text('Message Content', style: TextStyle(fontSize: 13, fontWeight: FontWeight.bold, color: AppTheme.secondaryText)),
            const SizedBox(height: 8),
            SelectableText(
              body,
              style: const TextStyle(fontSize: 14, color: AppTheme.mainText, height: 1.5),
            ),
            const SizedBox(height: 40),
            ElevatedButton.icon(
              onPressed: () {
                Navigator.push(
                  context,
                  MaterialPageRoute(
                    builder: (_) => AiDraftReplyScreen(emailItem: emailItem),
                  ),
                );
              },
              icon: const Icon(Icons.auto_awesome, size: 20),
              label: const Text('AI Draft Reply'),
            ),
          ],
        ),
      ),
    );
  }
}

// ──────────────────────────────────────────────
// Screen 15: AI Draft Reply Screen
// ──────────────────────────────────────────────
class AiDraftReplyScreen extends StatefulWidget {
  final Map<String, dynamic> emailItem;

  const AiDraftReplyScreen({super.key, required this.emailItem});

  @override
  State<AiDraftReplyScreen> createState() => _AiDraftReplyScreenState();
}

class _AiDraftReplyScreenState extends State<AiDraftReplyScreen> {
  late TextEditingController _subjectController;
  late TextEditingController _bodyController;
  bool _isGenerating = true;
  bool _isSending = false;

  @override
  void initState() {
    super.initState();
    final originalSubject = widget.emailItem['subject'] ?? '';
    _subjectController = TextEditingController(
      text: originalSubject.startsWith('Re:') ? originalSubject : 'Re: $originalSubject',
    );
    _bodyController = TextEditingController();
    _triggerAiGeneration();
  }

  Future<void> _triggerAiGeneration() async {
    setState(() => _isGenerating = true);
    final res = await ApiService.generateAiReply(
      fromEmail: widget.emailItem['from'] ?? '',
      subject: widget.emailItem['subject'] ?? '',
      snippet: widget.emailItem['snippet'] ?? '',
      body: widget.emailItem['body'],
    );
    if (mounted) {
      setState(() {
        _isGenerating = false;
        if (res['success'] == true) {
          _bodyController.text = res['reply_body'] ?? '';
          if (res['reply_subject'] != null) {
            _subjectController.text = res['reply_subject'];
          }
        }
      });
    }
  }

  Future<void> _sendReply() async {
    setState(() => _isSending = true);
    final res = await ApiService.sendReply(
      toEmail: widget.emailItem['from'] ?? '',
      subject: _subjectController.text,
      body: _bodyController.text,
    );
    setState(() => _isSending = false);

    if (res['success'] == true && mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Reply successfully sent via Google OAuth!')),
      );
      Navigator.pop(context);
      Navigator.pop(context);
    } else if (mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Send failed: ${res['detail'] ?? 'Error'}')),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.white,
      appBar: AppBar(
        title: const Text('AI Draft Reply', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 18)),
        actions: [
          IconButton(
            icon: const Icon(Icons.refresh),
            onPressed: _isGenerating ? null : _triggerAiGeneration,
            tooltip: 'Regenerate Draft',
          ),
        ],
      ),
      body: _isGenerating
          ? const Center(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  CircularProgressIndicator(),
                  SizedBox(height: 16),
                  Text('Gemini AI analyzing inquiry & drafting reply...', style: TextStyle(color: AppTheme.secondaryText)),
                ],
              ),
            )
          : SingleChildScrollView(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Container(
                    padding: const EdgeInsets.all(12),
                    decoration: BoxDecoration(
                      color: AppTheme.subtleBlue,
                      borderRadius: BorderRadius.circular(10),
                    ),
                    child: Row(
                      children: [
                        const Icon(Icons.person, color: AppTheme.actionBlue, size: 20),
                        const SizedBox(width: 8),
                        Expanded(
                          child: Text('To: ${widget.emailItem['from'] ?? ''}', style: const TextStyle(fontSize: 13, fontWeight: FontWeight.bold)),
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(height: 16),
                  const Text('Subject', style: TextStyle(fontSize: 13, fontWeight: FontWeight.bold, color: AppTheme.secondaryText)),
                  const SizedBox(height: 6),
                  TextField(
                    controller: _subjectController,
                    decoration: const InputDecoration(contentPadding: EdgeInsets.all(12)),
                  ),
                  const SizedBox(height: 16),
                  const Text('Response Body (Editable)', style: TextStyle(fontSize: 13, fontWeight: FontWeight.bold, color: AppTheme.secondaryText)),
                  const SizedBox(height: 6),
                  TextField(
                    controller: _bodyController,
                    maxLines: 12,
                    decoration: const InputDecoration(contentPadding: EdgeInsets.all(14)),
                  ),
                  const SizedBox(height: 24),
                  ElevatedButton(
                    onPressed: _isSending ? null : _sendReply,
                    child: _isSending
                        ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                        : const Text('Send Reply via Google OAuth'),
                  ),
                ],
              ),
            ),
    );
  }
}

// ──────────────────────────────────────────────
// Screen 16: Profile & Navigation Drawer ("More")
// ──────────────────────────────────────────────
class NavigationDrawerWidget extends StatelessWidget {
  final String userEmail;
  final Function(int)? onSelectTab;

  const NavigationDrawerWidget({
    super.key,
    required this.userEmail,
    this.onSelectTab,
  });

  void showTemplatesModal(BuildContext context, {bool isFromDrawer = false}) {
    if (isFromDrawer) Navigator.pop(context);
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (_) => Container(
        height: MediaQuery.of(context).size.height * 0.75,
        decoration: const BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
        ),
        padding: const EdgeInsets.all(20),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                const Text(
                  'Sales Email Templates',
                  style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold, color: AppTheme.primaryNavy),
                ),
                IconButton(
                  icon: const Icon(Icons.close),
                  onPressed: () => Navigator.pop(context),
                ),
              ],
            ),
            const SizedBox(height: 6),
            const Text(
              'Select an industry-standard template or compose customized replies.',
              style: TextStyle(color: AppTheme.secondaryText, fontSize: 13),
            ),
            const SizedBox(height: 16),
            Expanded(
              child: ListView(
                children: [
                  _buildTemplateTile(
                    context,
                    'Industrial Level Measurement Introduction',
                    'Capacitance & Tuning Fork Level Switches for silos, storage tanks and hazardous areas.',
                  ),
                  _buildTemplateTile(
                    context,
                    'Bulk Solids & Powder Applications',
                    'Ultrasonic and Radar transmitters with dust-proof robust non-contact continuous monitoring.',
                  ),
                  _buildTemplateTile(
                    context,
                    'Speed Switch & Conveyor Monitoring',
                    'Zero speed and slip detection for bucket elevators and material handling conveyors.',
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildTemplateTile(BuildContext context, String title, String desc) {
    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: AppTheme.subtleBlue,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: AppTheme.border),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(title, style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 14, color: AppTheme.primaryNavy)),
          const SizedBox(height: 6),
          Text(desc, style: const TextStyle(color: AppTheme.mainText, fontSize: 12.5)),
          const SizedBox(height: 10),
          Align(
            alignment: Alignment.centerRight,
            child: TextButton.icon(
              onPressed: () {
                Navigator.pop(context);
                ScaffoldMessenger.of(context).showSnackBar(
                  SnackBar(content: Text('Template "$title" selected for outbox drafts.')),
                );
                onSelectTab?.call(1);
              },
              icon: const Icon(Icons.send_outlined, size: 16),
              label: const Text('Use In Outbox', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 12)),
            ),
          ),
        ],
      ),
    );
  }

  void _showProductsModal(BuildContext context) {
    Navigator.pop(context);
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (_) => Container(
        height: MediaQuery.of(context).size.height * 0.8,
        decoration: const BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
        ),
        padding: const EdgeInsets.all(20),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                const Text(
                  'Products & Solutions Catalog',
                  style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold, color: AppTheme.primaryNavy),
                ),
                IconButton(
                  icon: const Icon(Icons.close),
                  onPressed: () => Navigator.pop(context),
                ),
              ],
            ),
            const SizedBox(height: 4),
            const Text(
              'Verified Industrial Instrumentation Solutions by SAPCON Instruments (Since 1983)',
              style: TextStyle(color: AppTheme.secondaryText, fontSize: 12),
            ),
            const SizedBox(height: 16),
            Expanded(
              child: ListView(
                children: [
                  _buildProductGroup('Level Switches (Point Level)', [
                    'SLA-7x Tuning Fork Level Switch (Liquids & Slurries)',
                    'Capacitance Level Switch (High Temp Solids & Ash)',
                    'RF Admittance Switch (Coating & Build-up immune)',
                  ]),
                  _buildProductGroup('Continuous Level Transmitters', [
                    '26 GHz / 80 GHz Non-contact Radar Transmitter',
                    'Guided Wave Radar Transmitter (Interface measurement)',
                    'Ultrasonic Level Transmitters (Water & Effluent)',
                  ]),
                  _buildProductGroup('Speed & Safety Sensors', [
                    'Non-contact Inductive Speed Switch',
                    'Electronic Zero Speed Monitor (ESM-10)',
                    'Pull Chord & Belt Sway Switches',
                  ]),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildProductGroup(String title, List<String> items) {
    return Container(
      margin: const EdgeInsets.only(bottom: 14),
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: AppTheme.background,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: AppTheme.border),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(title, style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 14, color: AppTheme.actionBlue)),
          const SizedBox(height: 8),
          ...items.map(
            (it) => Padding(
              padding: const EdgeInsets.symmetric(vertical: 4),
              child: Row(
                children: [
                  const Icon(Icons.check_circle, size: 16, color: AppTheme.success),
                  const SizedBox(width: 8),
                  Expanded(child: Text(it, style: const TextStyle(fontSize: 12.5, color: AppTheme.mainText))),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }

  void _showSettingsModal(BuildContext context) {
    Navigator.pop(context);
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (_) => Container(
        height: MediaQuery.of(context).size.height * 0.65,
        decoration: const BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
        ),
        padding: const EdgeInsets.all(20),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                const Text(
                  'Workbench Settings',
                  style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold, color: AppTheme.primaryNavy),
                ),
                IconButton(
                  icon: const Icon(Icons.close),
                  onPressed: () => Navigator.pop(context),
                ),
              ],
            ),
            const SizedBox(height: 16),
            ListTile(
              leading: const Icon(Icons.cloud_sync, color: AppTheme.actionBlue),
              title: const Text('Backend API Host'),
              subtitle: Text(ApiService.baseUrl),
              trailing: const Icon(Icons.check, color: AppTheme.success),
            ),
            const Divider(),
            ListTile(
              leading: const Icon(Icons.security, color: AppTheme.actionBlue),
              title: const Text('Authentication Mode'),
              subtitle: const Text('SQLite + Google OAuth 2.0'),
              trailing: const Chip(
                label: Text('Connected', style: TextStyle(color: Colors.white, fontSize: 10)),
                backgroundColor: AppTheme.success,
              ),
            ),
            const Divider(),
            ListTile(
              leading: const Icon(Icons.info_outline, color: AppTheme.secondaryText),
              title: const Text('App Version'),
              subtitle: const Text('SAPCON Sales Workbench v1.0.0 (Release APK)'),
            ),
          ],
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Drawer(
      backgroundColor: AppTheme.deepNavy,
      child: SafeArea(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Padding(
              padding: const EdgeInsets.all(20),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Container(
                        width: 40,
                        height: 40,
                        padding: const EdgeInsets.all(6),
                        decoration: BoxDecoration(
                          color: Colors.white,
                          borderRadius: BorderRadius.circular(10),
                          boxShadow: [
                            BoxShadow(
                              color: Colors.black.withValues(alpha: 0.2),
                              blurRadius: 8,
                            ),
                          ],
                        ),
                        child: Image.asset('assets/images/image1.png', fit: BoxFit.contain),
                      ),
                      const SizedBox(width: 12),
                      const Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text('SAPCON Instruments', style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 15)),
                          Text('Sales Workbench', style: TextStyle(color: Color(0xFF94A3B8), fontSize: 11)),
                        ],
                      ),
                    ],
                  ),
                  const SizedBox(height: 20),
                  Row(
                    children: [
                      CircleAvatar(
                        radius: 20,
                        backgroundColor: AppTheme.actionBlue,
                        child: Text(
                          userEmail.isNotEmpty ? userEmail[0].toUpperCase() : 'U',
                          style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold),
                        ),
                      ),
                      const SizedBox(width: 12),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(userEmail.split('@')[0], style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 14)),
                            Text(userEmail, style: const TextStyle(color: Color(0xFF94A3B8), fontSize: 11), maxLines: 1),
                          ],
                        ),
                      ),
                    ],
                  ),
                ],
              ),
            ),
            const Divider(color: Color(0xFF1E3A5F)),
            Expanded(
              child: ListView(
                padding: const EdgeInsets.symmetric(horizontal: 12),
                children: [
                  const Padding(
                    padding: EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                    child: Text('WORKSPACE', style: TextStyle(color: Color(0xFF64748B), fontSize: 11, fontWeight: FontWeight.bold)),
                  ),
                  _buildDrawerItem(Icons.home_outlined, 'Home', () {
                    Navigator.pop(context);
                    onSelectTab?.call(0);
                  }),
                  _buildDrawerItem(Icons.mail_outline, 'Outbox Drafts', () {
                    Navigator.pop(context);
                    onSelectTab?.call(1);
                  }),
                  _buildDrawerItem(Icons.person_add_alt, 'New Leads & File Ingestion', () {
                    Navigator.pop(context);
                    onSelectTab?.call(2);
                  }),
                  _buildDrawerItem(Icons.chat_bubble_outline, 'Client Inquiries', () {
                    Navigator.pop(context);
                    onSelectTab?.call(3);
                  }),
                  const SizedBox(height: 12),
                  const Padding(
                    padding: EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                    child: Text('MANAGEMENT', style: TextStyle(color: Color(0xFF64748B), fontSize: 11, fontWeight: FontWeight.bold)),
                  ),
                  _buildDrawerItem(Icons.article_outlined, 'Email Templates', () => showTemplatesModal(context, isFromDrawer: true)),
                  _buildDrawerItem(Icons.inventory_2_outlined, 'Products & Solutions', () => _showProductsModal(context)),
                  _buildDrawerItem(Icons.settings_outlined, 'Settings', () => _showSettingsModal(context)),
                ],
              ),
            ),
            const Divider(color: Color(0xFF1E3A5F)),
            Padding(
              padding: const EdgeInsets.all(16),
              child: InkWell(
                onTap: () async {
                  await ApiService.logout();
                  if (context.mounted) {
                    Navigator.pushAndRemoveUntil(
                      context,
                      MaterialPageRoute(builder: (_) => const LoginScreen()),
                      (route) => false,
                    );
                  }
                },
                borderRadius: BorderRadius.circular(10),
                child: Container(
                  padding: const EdgeInsets.symmetric(vertical: 12, horizontal: 16),
                  decoration: BoxDecoration(
                    color: const Color(0xFF7F1D1D).withValues(alpha: 0.4),
                    borderRadius: BorderRadius.circular(10),
                    border: Border.all(color: const Color(0xFFDC2626).withValues(alpha: 0.3)),
                  ),
                  child: const Row(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      Icon(Icons.logout, color: Color(0xFFFCA5A5), size: 18),
                      SizedBox(width: 8),
                      Text('Sign Out', style: TextStyle(color: Color(0xFFFCA5A5), fontWeight: FontWeight.bold, fontSize: 14)),
                    ],
                  ),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildDrawerItem(IconData icon, String title, VoidCallback onTap) {
    return ListTile(
      leading: Icon(icon, color: Colors.white70, size: 20),
      title: Text(title, style: const TextStyle(color: Colors.white, fontSize: 13, fontWeight: FontWeight.w500)),
      dense: true,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
      onTap: onTap,
    );
  }
}
