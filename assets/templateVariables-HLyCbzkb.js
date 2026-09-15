function e(e,t,n){let r=e.required_quantity?String(e.required_quantity):``,i=e.value?typeof e.value==`number`?`₹${e.value.toLocaleString(`en-IN`)}`:String(e.value):``;return{customer_name:e.name||`Valued Customer`,name:e.name||`Valued Customer`,company_name:e.company||e.organization||``,company:e.company||e.organization||``,event_name:e.event_name||`your upcoming event`,event_date:e.event_date||``,quantity:r,required_quantity:r,order_value:i,value:i,trophy_size:e.trophy_size||``,sales_person:e.sales_person||`EcoTrophy Sales Team`,design_person:e.design_person||`Design Team`,delivery_date:e.delivery_date||``,tracking_number:e.tracking_number||``,current_stage:t,stage_name:t,previous_stage:n||``,phone:e.phone||``,email:e.email||``,location:e.location||``}}function t(e,t){return e?e.replace(/\{\{([a-zA-Z0-9_]+)\}\}/g,(e,n)=>{let r=t[n];return r==null?``:String(r)}).replace(/\{([a-zA-Z0-9_]+)\}/g,(e,n)=>{let r=t[n];return r==null?``:String(r)}):``}var n={new_enquiry:{whatsapp_enabled:!0,whatsapp_template:`Hi {{customer_name}}, thank you for reaching out to EcoTrophy! We have received your inquiry for {{quantity}} trophies and our team will get in touch with you shortly to understand your requirements. – EcoTrophy`,sms_enabled:!1,sms_template:`Hi {{customer_name}}, we received your inquiry. EcoTrophy team will contact you shortly.`,email_enabled:!1,email_subject:`Thank you for contacting EcoTrophy - Inquiry Received`,email_template:`Hi {{customer_name}},

Thank you for reaching out to EcoTrophy regarding your trophy inquiry. Our team will review your details and connect with you shortly.

Warm regards,
EcoTrophy Team`},requirement_collection:{whatsapp_enabled:!0,whatsapp_template:`Hi {{customer_name}}, we are in the process of collecting and reviewing the design details and customization requirements for your order. Please feel free to share logos, text, or reference samples here. – EcoTrophy`,sms_enabled:!1,sms_template:`Hi {{customer_name}}, please share your trophy customization details with EcoTrophy.`,email_enabled:!1,email_subject:`Customization & Requirement Details - EcoTrophy`,email_template:`Hi {{customer_name}},

We are collecting the specific customization requirements (logos, text, sizes) for your order. Please reply with your requirements.

Best regards,
EcoTrophy`},requirement_confirmed:{whatsapp_enabled:!0,whatsapp_template:`Hi {{customer_name}}, we have successfully confirmed your trophy specifications for {{event_name}}. Your order is now ready for our design team. – EcoTrophy`,sms_enabled:!1,sms_template:`Hi {{customer_name}}, your trophy order requirements have been confirmed with EcoTrophy.`,email_enabled:!1,email_subject:`Order Requirements Confirmed - EcoTrophy`,email_template:`Hi {{customer_name}},

Your trophy requirements for {{event_name}} have been confirmed. We are queuing this for our design team.

Best regards,
EcoTrophy`},design_stage:{whatsapp_enabled:!0,whatsapp_template:`Hi {{customer_name}}, your trophy order has now entered the Design Stage. Our design team is working on your trophy design. We will share the design with you once it is ready. – EcoTrophy`,sms_enabled:!1,sms_template:`Hi {{customer_name}}, your trophy order has entered the Design Stage at EcoTrophy.`,email_enabled:!1,email_subject:`Trophy Order In Design Stage - EcoTrophy`,email_template:`Hi {{customer_name}},

Your trophy order has now entered the Design Stage. Our design team is preparing your custom artwork.

Best regards,
EcoTrophy`},design_approval:{whatsapp_enabled:!0,whatsapp_template:`Hi {{customer_name}}, your trophy design is ready for approval. Please review the design shared with you and confirm so we can proceed further. – EcoTrophy`,sms_enabled:!1,sms_template:`Hi {{customer_name}}, your trophy design is ready for approval. Please check WhatsApp/Email to confirm. – EcoTrophy`,email_enabled:!1,email_subject:`Action Required: Trophy Design Ready for Approval - EcoTrophy`,email_template:`Hi {{customer_name}},

Your trophy design draft is ready for approval. Please review the attached design and reply with your confirmation so we can proceed.

Best regards,
EcoTrophy`},quotation_sent:{whatsapp_enabled:!0,whatsapp_template:`Hi {{customer_name}}, we have shared the official quotation for your order of {{quantity}} trophies (Total: {{order_value}}). Please review and let us know if you have any questions. – EcoTrophy`,sms_enabled:!1,sms_template:`Hi {{customer_name}}, quotation for your trophy order has been sent. – EcoTrophy`,email_enabled:!1,email_subject:`Official Quotation for Trophy Order - EcoTrophy`,email_template:`Hi {{customer_name}},

Please find the quotation for your upcoming order of {{quantity}} trophies. Feel free to contact us with any questions.

Best regards,
EcoTrophy`},follow_up:{whatsapp_enabled:!0,whatsapp_template:`Hi {{customer_name}}, following up regarding your trophy inquiry for {{event_name}}. Please let us know if you need any assistance or modifications to proceed. – EcoTrophy`,sms_enabled:!1,sms_template:`Hi {{customer_name}}, following up on your trophy inquiry. Let us know how we can assist. – EcoTrophy`,email_enabled:!1,email_subject:`Following up on your EcoTrophy inquiry`,email_template:`Hi {{customer_name}},

Just following up to see if you have any questions regarding your trophy order for {{event_name}}.

Best regards,
EcoTrophy`},advance_payment:{whatsapp_enabled:!0,whatsapp_template:`Hi {{customer_name}}, your order has been moved to the Advance Payment stage. Once the advance payment is completed, we will immediately initiate manufacturing. – EcoTrophy`,sms_enabled:!1,sms_template:`Hi {{customer_name}}, please complete the advance payment to start production on your trophy order. – EcoTrophy`,email_enabled:!1,email_subject:`Advance Payment Confirmation - EcoTrophy`,email_template:`Hi {{customer_name}},

Your order has been queued for production pending advance payment confirmation.

Best regards,
EcoTrophy`},production:{whatsapp_enabled:!0,whatsapp_template:`Hi {{customer_name}}, your trophy design has been approved and your order has now moved to Production. We will keep you updated on the progress. – EcoTrophy`,sms_enabled:!1,sms_template:`Hi {{customer_name}}, your trophy order is now in Production at EcoTrophy.`,email_enabled:!1,email_subject:`Order In Production - EcoTrophy`,email_template:`Hi {{customer_name}},

Your trophy design has been approved and your order of {{quantity}} trophies has moved to Production. We will notify you once manufacturing is complete.

Best regards,
EcoTrophy`},quality_check:{whatsapp_enabled:!0,whatsapp_template:`Hi {{customer_name}}, your trophies have completed manufacturing and are currently undergoing our thorough Quality Check process before packaging. – EcoTrophy`,sms_enabled:!1,sms_template:`Hi {{customer_name}}, your trophy order is undergoing final quality inspection. – EcoTrophy`,email_enabled:!1,email_subject:`Order In Quality Check - EcoTrophy`,email_template:`Hi {{customer_name}},

Your trophies have completed manufacturing and are undergoing quality inspection.

Best regards,
EcoTrophy`},ready_for_dispatch:{whatsapp_enabled:!0,whatsapp_template:`Hi {{customer_name}}, your trophy order is ready for dispatch. Our team is preparing the shipment and dispatch details will be shared shortly. – EcoTrophy`,sms_enabled:!1,sms_template:`Hi {{customer_name}}, your trophy order is packed and ready for dispatch. – EcoTrophy`,email_enabled:!1,email_subject:`Order Ready for Dispatch - EcoTrophy`,email_template:`Hi {{customer_name}},

Your trophy order is packaged and ready for dispatch. Shipment tracking details will follow shortly.

Best regards,
EcoTrophy`},dispatch:{whatsapp_enabled:!0,whatsapp_template:`Hi {{customer_name}}, your trophy order has been dispatched successfully. We will share the tracking/delivery details with you. – EcoTrophy`,sms_enabled:!1,sms_template:`Hi {{customer_name}}, your trophy order has been dispatched! Tracking details will be shared shortly. – EcoTrophy`,email_enabled:!1,email_subject:`Your EcoTrophy Order Has Been Dispatched`,email_template:`Hi {{customer_name}},

Your order has been dispatched. Tracking number: {{tracking_number}}.

Best regards,
EcoTrophy`},delivered:{whatsapp_enabled:!0,whatsapp_template:`Hi {{customer_name}}, your trophy order has been marked as delivered. Thank you for choosing EcoTrophy. We hope the trophies make the occasion memorable.`,sms_enabled:!1,sms_template:`Hi {{customer_name}}, your trophy order has been delivered. Thank you for choosing EcoTrophy!`,email_enabled:!1,email_subject:`Order Delivered - Thank You for Choosing EcoTrophy`,email_template:`Hi {{customer_name}},

Your trophy order has been delivered. We hope the trophies make {{event_name}} truly memorable!

Warm regards,
EcoTrophy Team`},full_payment:{whatsapp_enabled:!0,whatsapp_template:`Hi {{customer_name}}, we have successfully recorded the full payment for your order. Thank you for your business! – EcoTrophy`,sms_enabled:!1,sms_template:`Hi {{customer_name}}, full payment received with thanks. – EcoTrophy`,email_enabled:!1,email_subject:`Payment Received in Full - EcoTrophy`,email_template:`Hi {{customer_name}},

We have received full payment for your order. Thank you for partnering with EcoTrophy.

Best regards,
EcoTrophy`},completed:{whatsapp_enabled:!0,whatsapp_template:`Hi {{customer_name}}, your order for {{event_name}} is now marked as Completed. It was a pleasure working with you, and we look forward to crafting trophies for your future events! – EcoTrophy`,sms_enabled:!1,sms_template:`Hi {{customer_name}}, your order is completed. Thank you for choosing EcoTrophy!`,email_enabled:!1,email_subject:`Order Completed - EcoTrophy`,email_template:`Hi {{customer_name}},

Your order for {{event_name}} is completed. Thank you for choosing EcoTrophy!

Warm regards,
EcoTrophy`},lost_cancelled:{whatsapp_enabled:!1,whatsapp_template:`Hi {{customer_name}}, thank you for your interest in EcoTrophy. We have updated your inquiry status. Feel free to contact us whenever you need custom awards in the future! – EcoTrophy`,sms_enabled:!1,sms_template:`Hi {{customer_name}}, thank you for considering EcoTrophy for your awards.`,email_enabled:!1,email_subject:`EcoTrophy Inquiry Status Update`,email_template:`Hi {{customer_name}},

Thank you for considering EcoTrophy. We hope to work with you on future events.

Warm regards,
EcoTrophy`}},r=[{variable:`{{customer_name}}`,label:`Customer Name`,example:`Aarav Sharma`},{variable:`{{company_name}}`,label:`Company / Org`,example:`Rotary Club`},{variable:`{{event_name}}`,label:`Event Name`,example:`Annual Sports Day`},{variable:`{{event_date}}`,label:`Event Date`,example:`24 Oct 2026`},{variable:`{{quantity}}`,label:`Quantity`,example:`50`},{variable:`{{order_value}}`,label:`Order Value`,example:`₹35,000`},{variable:`{{trophy_size}}`,label:`Trophy Size`,example:`8 inches`},{variable:`{{sales_person}}`,label:`Sales Person`,example:`Monisha`},{variable:`{{design_person}}`,label:`Design Person`,example:`Karthik`},{variable:`{{delivery_date}}`,label:`Delivery Date`,example:`20 Oct 2026`},{variable:`{{tracking_number}}`,label:`Tracking #`,example:`ST49201928`},{variable:`{{current_stage}}`,label:`Current Stage`,example:`Design Stage`},{variable:`{{previous_stage}}`,label:`Previous Stage`,example:`Requirement Confirmed`}];export{t as i,n,e as r,r as t};