import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/network/dio_provider.dart';
import '../domain/my_contract.dart';
import '../domain/my_profile.dart';

/// Lee el perfil propio del colaborador (GET /me/profile) y su contrato (GET /me/contract).
/// Solo lectura.
class ProfileRepository {
  ProfileRepository(this._dio);
  final Dio _dio;

  Future<MyProfile> me() async {
    final res = await _dio.get<Map<String, dynamic>>('/me/profile');
    return MyProfile.fromJson(res.data!);
  }

  /// Contrato vigente o próximo; nulo si no tiene ninguno registrado (204).
  Future<MyContract?> contract() async {
    final res = await _dio.get<Map<String, dynamic>>('/me/contract');
    final data = res.data;
    return data == null ? null : MyContract.fromJson(data);
  }
}

final profileRepositoryProvider =
    Provider<ProfileRepository>((ref) => ProfileRepository(ref.read(dioProvider)));

final myProfileProvider =
    FutureProvider<MyProfile>((ref) => ref.read(profileRepositoryProvider).me());

/// Datos del colaborador en sesión: debe invalidarse al cerrar sesión (AuthController).
final myContractProvider =
    FutureProvider<MyContract?>((ref) => ref.read(profileRepositoryProvider).contract());
