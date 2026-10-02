const messages = {
  PROVISIONING_DISABLED: 'Tashkilot yaratish vaqtincha yopiq. Administratorga murojaat qiling.',
  ADMIN_ACCESS_DENIED: 'Tashkilot yaratish uchun bosh administrator huquqi kerak.',
  AUTH_REQUIRED: 'Sessiya tugagan. Qayta tizimga kiring.',
  INVALID_INPUT: 'Tashkilot ma’lumotlari, email va parolni tekshiring.',
  RATE_LIMITED: 'Urinishlar chegarasiga yetdingiz. 15 daqiqadan keyin qayta urinib ko‘ring.',
  PROVISIONING_REQUIRES_REVIEW: 'Natijani administrator tekshirishi kerak. Yangi ariza yaratmang.',
};
export async function submitOrganizationProvisioning(client, body) {
  try {
    const {data,error} = await client.functions.invoke('provision-organization', {body});
    if (error) {
      let code;
      try { code = (await error.context?.clone().json())?.code; } catch { /* Never expose upstream details. */ }
      throw new Error(messages[code] || 'Natija olinmadi. Shu oynadan qayta urinib ko‘ring; yangi ariza yaratmang.');
    }
    if (data?.code !== 'PROVISIONED' || !Number.isSafeInteger(data.organizationId) || data.organizationId <= 0) {
      throw new Error('Natija tasdiqlanmadi. Administratorga murojaat qiling.');
    }
    return data.organizationId;
  } catch (error) {
    // Only locally defined UI messages may leave this boundary.
    if (Object.values(messages).includes(error.message)
      || error.message === 'Natija olinmadi. Shu oynadan qayta urinib ko‘ring; yangi ariza yaratmang.'
      || error.message === 'Natija tasdiqlanmadi. Administratorga murojaat qiling.') throw error;
    throw new Error('Server bilan aloqa uzildi. Shu oynadan qayta urinib ko‘ring; yangi ariza yaratmang.');
  }
}
