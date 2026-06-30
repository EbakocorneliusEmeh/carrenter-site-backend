import { BusinessPageStatus } from '../../common/enums/business-page-status.enum';

export class UpdateBusinessPageDto {
  businessName?: string;
  slug?: string;
  description?: string;
  pagePassword?: string;
  status?: BusinessPageStatus;
}
