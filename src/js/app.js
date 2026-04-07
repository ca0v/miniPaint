// Store singletons for easy access
export default {
    GUI: null,
    Tools: null,
    Layers: null,
    Config: null,
    State: null,
    FileOpen: null,
    FileSave: null,
    Actions: null,
    auditTrail: [],
    pushAuditTrail(event) {
        if (this.auditTrail.length === 0) {
            var existing = $('#PMEditedPhotoEvents').val();
            if (existing) {
                existing.split(';').filter(e => e.length > 0).forEach(e => {
                    this.auditTrail.push(e);
                });
            }
        }
        this.auditTrail.push(event);
    }
};
