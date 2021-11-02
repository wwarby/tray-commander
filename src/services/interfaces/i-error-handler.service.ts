export interface IErrorHandlerService {
  handleError(e: Error): Promise<void>;
}
