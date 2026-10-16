import 'dart:convert';
import 'package:http/http.dart' as http;

import 'dart:io' show Platform;
import 'package:flutter/foundation.dart' show kIsWeb;

class ApiService {
  // Primary host IP of this machine on the LAN
  static const String lanHost = '10.130.173.220';

  // Intelligently resolve the backend URL depending on the running environment:
  // - Android emulator: 10.0.2.2
  // - Physical Android phone / local network: 10.130.173.220
  // - Web / Windows desktop: 127.0.0.1
  static String get baseUrl {
    if (kIsWeb) return 'http://127.0.0.1:8000';
    try {
      if (Platform.isAndroid) {
        // Use LAN IP so physical devices on Wi-Fi and emulators can both reach the server
        return 'http://$lanHost:8000';
      }
    } catch (_) {}
    return 'http://127.0.0.1:8000';
  }

  // Check auth status
  static Future<Map<String, dynamic>> getAuthStatus() async {
    try {
      final response = await http.get(Uri.parse('$baseUrl/auth/status')).timeout(const Duration(seconds: 4));
      if (response.statusCode == 200) {
        return jsonDecode(response.body);
      }
    } catch (_) {}
    return {'authenticated': false, 'email': null};
  }

  // Get Google OAuth consent URL
  static Future<String?> getGoogleLoginUrl() async {
    try {
      final response = await http.get(Uri.parse('$baseUrl/auth/login-url')).timeout(const Duration(seconds: 6));
      if (response.statusCode == 200) {
        final data = jsonDecode(response.body);
        return data['url'] as String?;
      }
    } catch (_) {}
    return null;
  }

  // Register user (Sign Up)
  static Future<Map<String, dynamic>> register({
    required String name,
    required String email,
    required String password,
  }) async {
    try {
      final response = await http.post(
        Uri.parse('$baseUrl/auth/register'),
        headers: {'Content-Type': 'application/json'},
        body: jsonEncode({'name': name, 'email': email, 'password': password}),
      ).timeout(const Duration(seconds: 6));
      final data = jsonDecode(response.body);
      if (response.statusCode == 200) {
        return {'success': true, 'message': data['message'] ?? 'Registration successful', 'user': data['user']};
      }
      return {'success': false, 'detail': data['detail'] ?? 'Registration failed'};
    } catch (e) {
      return {'success': false, 'detail': e.toString()};
    }
  }

  // Login user (Sign In)
  static Future<Map<String, dynamic>> login({
    required String email,
    required String password,
  }) async {
    try {
      final response = await http.post(
        Uri.parse('$baseUrl/auth/login'),
        headers: {'Content-Type': 'application/json'},
        body: jsonEncode({'email': email, 'password': password}),
      ).timeout(const Duration(seconds: 6));
      final data = jsonDecode(response.body);
      if (response.statusCode == 200) {
        return {'success': true, 'message': data['message'] ?? 'Login successful', 'user': data['user']};
      }
      return {'success': false, 'detail': data['detail'] ?? 'Login failed'};
    } catch (e) {
      return {'success': false, 'detail': e.toString()};
    }
  }

  // Get active queue & metrics
  static Future<Map<String, dynamic>> getQueue() async {
    try {
      final response = await http.get(Uri.parse('$baseUrl/api/queue')).timeout(const Duration(seconds: 5));
      if (response.statusCode == 200) {
        return jsonDecode(response.body);
      }
    } catch (_) {}
    return {'success': false, 'queue': [], 'metrics': {'pending_review': 0, 'approved': 0, 'sent': 0, 'total_leads': 0}};
  }

  // Approve a draft
  static Future<Map<String, dynamic>> approveDraft(String queueId) async {
    try {
      final response = await http.post(
        Uri.parse('$baseUrl/api/approve/$queueId'),
        headers: {'Content-Type': 'application/json'},
      );
      return jsonDecode(response.body);
    } catch (e) {
      return {'success': false, 'detail': e.toString()};
    }
  }

  // Update a draft
  static Future<Map<String, dynamic>> updateDraft(String queueId, String subject, String body) async {
    try {
      final response = await http.post(
        Uri.parse('$baseUrl/api/update_draft/$queueId'),
        headers: {'Content-Type': 'application/json'},
        body: jsonEncode({'subject': subject, 'body': body}),
      );
      return jsonDecode(response.body);
    } catch (e) {
      return {'success': false, 'detail': e.toString()};
    }
  }

  // Delete a draft from queue
  static Future<Map<String, dynamic>> deleteDraft(String queueId) async {
    try {
      final response = await http.delete(Uri.parse('$baseUrl/api/queue/$queueId'));
      return jsonDecode(response.body);
    } catch (e) {
      return {'success': false, 'detail': e.toString()};
    }
  }

  // Submit manual single lead
  static Future<Map<String, dynamic>> submitManualLead({
    required String companyName,
    required String email,
    required String demand,
    bool directSend = false,
  }) async {
    try {
      final response = await http.post(
        Uri.parse('$baseUrl/api/submit_manual'),
        headers: {'Content-Type': 'application/json'},
        body: jsonEncode({
          'company_name': companyName,
          'email': email,
          'demand': demand,
          'direct_send': directSend,
        }),
      );
      return jsonDecode(response.body);
    } catch (e) {
      return {'success': false, 'detail': e.toString()};
    }
  }

  // Upload Excel / CSV file
  static Future<Map<String, dynamic>> uploadLeadFile({
    required List<int> fileBytes,
    required String fileName,
    bool directSend = false,
  }) async {
    try {
      var request = http.MultipartRequest('POST', Uri.parse('$baseUrl/api/upload_file'));
      request.fields['direct_send'] = directSend ? 'true' : 'false';
      request.files.add(http.MultipartFile.fromBytes('file', fileBytes, filename: fileName));

      var streamedResponse = await request.send();
      var response = await http.Response.fromStream(streamedResponse);
      return jsonDecode(response.body);
    } catch (e) {
      return {'success': false, 'detail': e.toString()};
    }
  }

  // Fetch recent customer inquiries
  static Future<Map<String, dynamic>> getRecentInquiries() async {
    try {
      final response = await http.get(Uri.parse('$baseUrl/api/inbox/recent')).timeout(const Duration(seconds: 6));
      if (response.statusCode == 200) {
        return jsonDecode(response.body);
      }
    } catch (_) {}
    return {'success': false, 'emails': []};
  }

  // Generate AI Reply for an inquiry
  static Future<Map<String, dynamic>> generateAiReply({
    required String fromEmail,
    required String subject,
    required String snippet,
    String? body,
  }) async {
    try {
      final response = await http.post(
        Uri.parse('$baseUrl/api/inbox/generate_reply'),
        headers: {'Content-Type': 'application/json'},
        body: jsonEncode({
          'from_email': fromEmail,
          'subject': subject,
          'snippet': snippet,
          'body': body ?? snippet,
        }),
      );
      return jsonDecode(response.body);
    } catch (e) {
      return {'success': false, 'detail': e.toString()};
    }
  }

  // Send AI Reply via authorized Google OAuth
  static Future<Map<String, dynamic>> sendReply({
    required String toEmail,
    required String subject,
    required String body,
    String inReplyTo = '',
    String references = '',
  }) async {
    try {
      final response = await http.post(
        Uri.parse('$baseUrl/api/inbox/send_reply'),
        headers: {'Content-Type': 'application/json'},
        body: jsonEncode({
          'to_email': toEmail,
          'subject': subject,
          'body': body,
          'in_reply_to': inReplyTo,
          'references': references,
        }),
      );
      return jsonDecode(response.body);
    } catch (e) {
      return {'success': false, 'detail': e.toString()};
    }
  }

  // Logout
  static Future<void> logout() async {
    try {
      await http.get(Uri.parse('$baseUrl/auth/logout'));
    } catch (_) {}
  }
}
