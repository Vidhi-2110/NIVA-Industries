/**
 * NIVA INDUSTRIES - Core Client Logic
 * Pure Vanilla JavaScript (ES6+)
 * No external dependencies or libraries
 */

document.addEventListener('DOMContentLoaded', () => {
  'use strict';

  /* ==========================================================================
     1. Sticky Navbar & Header Scroll State
     ========================================================================== */
  const header = document.querySelector('.header-sticky');
  
  const handleScroll = () => {
    if (!header) return;
    if (window.scrollY > 40) {
      header.classList.add('scrolled');
    } else {
      header.classList.remove('scrolled');
    }
  };

  window.addEventListener('scroll', handleScroll, { passive: true });
  handleScroll(); // Initial check

  /* ==========================================================================
     2. Mobile Hamburger Navigation
     ========================================================================== */
  const hamburgerBtn = document.querySelector('.nav-hamburger');
  const navMenu = document.querySelector('.nav-menu');
  const navLinks = document.querySelectorAll('.nav-link');

  if (hamburgerBtn && navMenu) {
    const toggleMenu = () => {
      const isOpen = hamburgerBtn.classList.toggle('active');
      navMenu.classList.toggle('active');
      hamburgerBtn.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
      if (isOpen) {
        document.body.classList.add('menu-open');
      } else {
        document.body.classList.remove('menu-open');
      }
    };

    const closeMenu = () => {
      hamburgerBtn.classList.remove('active');
      navMenu.classList.remove('active');
      hamburgerBtn.setAttribute('aria-expanded', 'false');
      document.body.classList.remove('menu-open');
    };

    hamburgerBtn.addEventListener('click', toggleMenu);

    navLinks.forEach(link => {
      link.addEventListener('click', () => {
        if (window.innerWidth <= 768) {
          closeMenu();
        }
      });
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && navMenu.classList.contains('active')) {
        closeMenu();
      }
    });

    document.addEventListener('click', (e) => {
      if (navMenu.classList.contains('active') &&
          !navMenu.contains(e.target) &&
          !hamburgerBtn.contains(e.target)) {
        closeMenu();
      }
    });
  }

  /* ==========================================================================
     3. Active Navigation Link Detection
     ========================================================================== */
  const currentPath = window.location.pathname;
  navLinks.forEach(link => {
    const href = link.getAttribute('href');
    if (!href) return;
    
    const isHome = (currentPath.endsWith('/') || currentPath.endsWith('index.html')) && (href === 'index.html' || href === './');
    const isCurrentPage = currentPath.endsWith(href);

    if (isHome || isCurrentPage) {
      link.classList.add('active');
    } else {
      link.classList.remove('active');
    }
  });

  /* ==========================================================================
     4. Scroll Reveal Animations (IntersectionObserver)
     ========================================================================== */
  const revealElements = document.querySelectorAll('.reveal, .reveal-left, .reveal-right, .reveal-scale');

  if ('IntersectionObserver' in window && revealElements.length > 0) {
    const revealObserver = new IntersectionObserver((entries, observer) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('active');
          observer.unobserve(entry.target);
        }
      });
    }, {
      root: null,
      threshold: 0.12,
      rootMargin: '0px 0px -40px 0px'
    });

    revealElements.forEach(el => {
      revealObserver.observe(el);
      const rect = el.getBoundingClientRect();
      if (rect.top < window.innerHeight && rect.bottom > 0) {
        el.classList.add('active');
      }
    });
  } else {
    revealElements.forEach(el => el.classList.add('active'));
  }

  /* ==========================================================================
     5. Animated Number Counters
     ========================================================================== */
  const counterElements = document.querySelectorAll('[data-counter-target]');

  if ('IntersectionObserver' in window && counterElements.length > 0) {
    const counterObserver = new IntersectionObserver((entries, observer) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          const el = entry.target;
          const target = parseFloat(el.getAttribute('data-counter-target'));
          const suffix = el.getAttribute('data-counter-suffix') || '';
          const decimals = parseInt(el.getAttribute('data-counter-decimals') || '0', 10);
          const duration = 1800; // ms
          const startTime = performance.now();

          const updateCounter = (currentTime) => {
            const elapsed = currentTime - startTime;
            const progress = Math.min(elapsed / duration, 1);
            const easeOutProgress = 1 - Math.pow(1 - progress, 3);
            const currentVal = easeOutProgress * target;

            el.textContent = currentVal.toFixed(decimals) + suffix;

            if (progress < 1) {
              requestAnimationFrame(updateCounter);
            } else {
              el.textContent = target.toFixed(decimals) + suffix;
            }
          };

          requestAnimationFrame(updateCounter);
          observer.unobserve(el);
        }
      });
    }, { threshold: 0.2 });

    counterElements.forEach(counter => counterObserver.observe(counter));
  }

  /* ==========================================================================
     6. Product Catalog Category Filtering (products.html)
     ========================================================================== */
  const filterButtons = document.querySelectorAll('.filter-tabs .filter-btn, .product-filter-bar .filter-btn');
  const catalogProductCards = document.querySelectorAll('.product-grid .product-card');

  if (filterButtons.length > 0 && catalogProductCards.length > 0) {
    filterButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        filterButtons.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');

        const selectedCategory = btn.getAttribute('data-filter');

        catalogProductCards.forEach(card => {
          const cardCategory = card.getAttribute('data-category');
          if (selectedCategory === 'all' || cardCategory === selectedCategory || (cardCategory && cardCategory.includes(selectedCategory))) {
            card.style.display = 'flex';
          } else {
            card.style.display = 'none';
          }
        });
      });
    });
  }


  /* ==========================================================================
     7. Interactive FAQ Accordion (contact.html & index.html)
     ========================================================================== */
  const accordionHeaders = document.querySelectorAll('.accordion-header');

  accordionHeaders.forEach(headerBtn => {
    headerBtn.addEventListener('click', () => {
      const item = headerBtn.closest('.accordion-item');
      const content = item.querySelector('.accordion-content');
      const isOpen = item.classList.contains('active');

      const parentAccordion = item.closest('.accordion');
      if (parentAccordion) {
        parentAccordion.querySelectorAll('.accordion-item').forEach(otherItem => {
          if (otherItem !== item) {
            otherItem.classList.remove('active');
            const otherContent = otherItem.querySelector('.accordion-content');
            if (otherContent) otherContent.style.maxHeight = null;
          }
        });
      }

      if (isOpen) {
        item.classList.remove('active');
        content.style.maxHeight = null;
      } else {
        item.classList.add('active');
        content.style.maxHeight = content.scrollHeight + 'px';
      }
    });
  });

  // Dark Eco Section Accordion (CSS grid-template-rows animation, zero inline styles)
  const darkAccordionTriggers = document.querySelectorAll('.dark-accordion-trigger');
  darkAccordionTriggers.forEach(trigger => {
    trigger.addEventListener('click', () => {
      const item = trigger.closest('.dark-accordion-item');
      if (!item) return;
      const isOpen = item.classList.contains('active');
      const parent = item.closest('.dark-eco-accordion');

      if (parent) {
        parent.querySelectorAll('.dark-accordion-item').forEach(other => {
          if (other !== item) {
            other.classList.remove('active');
            const otherBtn = other.querySelector('.dark-accordion-trigger');
            if (otherBtn) otherBtn.setAttribute('aria-expanded', 'false');
          }
        });
      }

      if (isOpen) {
        item.classList.remove('active');
        trigger.setAttribute('aria-expanded', 'false');
      } else {
        item.classList.add('active');
        trigger.setAttribute('aria-expanded', 'true');
      }
    });
  });

  /* ==========================================================================
     8. Toast Notification System
     ========================================================================== */
  const showToast = (message, title = 'Notification') => {
    let container = document.querySelector('.toast-container');
    if (!container) {
      container = document.createElement('div');
      container.className = 'toast-container';
      document.body.appendChild(container);
    }

    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.innerHTML = `
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#0063EB" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
        <polyline points="22 4 12 14.01 9 11.01"></polyline>
      </svg>
      <div>
        <div class="toast-title">${title}</div>
        <div class="toast-desc">${message}</div>
      </div>
    `;

    container.appendChild(toast);
    setTimeout(() => toast.classList.add('show'), 50);

    setTimeout(() => {
      toast.classList.remove('show');
      setTimeout(() => toast.remove(), 400);
    }, 4500);
  };

  /* ==========================================================================
     9. RFQ / Contact Form Handling (contact.html)
     ========================================================================== */
  const contactForm = document.getElementById('contact-rfq-form');

  if (contactForm) {
    contactForm.addEventListener('submit', (e) => {
      e.preventDefault();

      let isValid = true;
      const requiredInputs = contactForm.querySelectorAll('[required]');

      requiredInputs.forEach(input => {
        const errorMsg = input.parentElement.querySelector('.form-error-msg');
        if (!input.value.trim()) {
          isValid = false;
          input.classList.add('is-invalid');
          if (errorMsg) errorMsg.style.display = 'block';
        } else {
          if (input.type === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.value)) {
            isValid = false;
            input.classList.add('is-invalid');
            if (errorMsg) errorMsg.style.display = 'block';
          } else {
            input.classList.remove('is-invalid');
            if (errorMsg) errorMsg.style.display = 'none';
          }
        }
      });

      if (isValid) {
        const submitBtn = contactForm.querySelector('button[type="submit"]');
        const originalText = submitBtn.innerHTML;

        submitBtn.disabled = true;
        submitBtn.innerHTML = `
          <svg class="spinner-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="10" stroke-opacity="0.3"></circle>
            <path d="M12 2 A 10 10 0 0 1 22 12"></path>
          </svg>
          Processing RFQ...
        `;

        setTimeout(() => {
          submitBtn.disabled = false;
          submitBtn.innerHTML = originalText;
          contactForm.reset();
          showToast('Thank you! Your quotation request has been routed to our metallurgy desk. We will respond within 4 business hours.', 'RFQ Submitted Successfully');
        }, 1200);
      }
    });

    contactForm.querySelectorAll('input, select, textarea').forEach(field => {
      field.addEventListener('input', () => {
        field.classList.remove('is-invalid');
        const errorMsg = field.parentElement.querySelector('.form-error-msg');
        if (errorMsg) errorMsg.style.display = 'none';
      });
    });
  }

  /* ==========================================================================
     10. Newsletter Subscription Forms
     ========================================================================== */
  const newsletterForms = document.querySelectorAll('.footer-newsletter-form');
  newsletterForms.forEach(form => {
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const input = form.querySelector('.newsletter-input');
      if (input && input.value.trim() && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.value)) {
        showToast('You have subscribed to NIVA Metallurgical & Market Reports.', 'Subscribed');
        input.value = '';
      } else if (input) {
        showToast('Please enter a valid business email address.', 'Invalid Email');
      }
    });
  });

  /* ==========================================================================
     11. Back to Top Button
     ========================================================================== */
  const backToTopBtn = document.getElementById('back-to-top');
  if (backToTopBtn) {
    backToTopBtn.addEventListener('click', (e) => {
      e.preventDefault();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  }
});


